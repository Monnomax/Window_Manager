import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const RESTORE_DELAY_MS = 700;
const SAVE_DELAY_MS = 250;
const FIRST_FRAME_TIMEOUT_MS = 1800;
const GEOMETRY_RETRY_INTERVAL_MS = 120;
const GEOMETRY_WAIT_TIMEOUT_MS = 1200;
const GEOMETRY_POLL_INTERVAL_MS = 16;
const WINDOW_TYPES = new Set([
    Meta.WindowType.NORMAL,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.UTILITY,
]);

export default class WindowControlExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._windowStates = this._loadWindowStates();
        this._trackedWindows = new Map();
        this._windowTracker = Shell.WindowTracker.get_default();

        // Mutter emits window-created before the first frame is drawn.
        // Connect before the default handler so we can suppress the initial frame.
        this._windowCreatedId = global.display.connect(
            "window-created",
            (_display, window) => this._trackWindow(window, true),
        );

        // These windows already have actors and may already have rendered a frame,
        // so they must not be hidden while the extension is enabled.
        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window, false);
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }

        for (const [window, tracking] of this._trackedWindows) {
            if (tracking.ready)
                this._saveWindow(window);

            this._untrackWindow(window, tracking);
        }

        this._trackedWindows.clear();
        this._settings = null;
        this._windowTracker = null;
        this._windowStates = null;
    }

    _loadWindowStates() {
        const serialized = this._settings.get_string("window-states");
        try {
            const states = JSON.parse(serialized);
            if (states && typeof states === "object" && !Array.isArray(states))
                return states;

            log("Window Control: збережені дані вікон мають неправильний формат.");
        } catch (error) {
            logError(error, "Window Control: не вдалося прочитати збережені дані вікон.");
        }
        return {};
    }

    _trackWindow(window, isNew = false) {
        if (this._trackedWindows.has(window) ||
            !WINDOW_TYPES.has(window.get_window_type()))
            return;

        const actor = isNew ? window.get_compositor_private() : null;
        const tracking = {
            ready: false,
            restoreSourceId: 0,
            saveSourceId: 0,
            safetySourceId: 0,
            firstFrameId: 0,
            opacitySignalId: 0,
            signalIds: [],
            actor,
            originalOpacity: actor?.get_opacity() ?? 255,
            actorSuppressed: false,
            restoreTarget: null,
            restoreDeadline: 0,
            nextGeometryRetry: 0,
        };
        this._trackedWindows.set(window, tracking);

        const scheduleSave = () => {
            if (!tracking.ready || tracking.saveSourceId)
                return;

            tracking.saveSourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                SAVE_DELAY_MS,
                () => {
                    tracking.saveSourceId = 0;
                    if (this._trackedWindows.has(window) && tracking.ready)
                        this._saveWindow(window);
                    return GLib.SOURCE_REMOVE;
                },
            );
        };

        tracking.signalIds.push(
            window.connect("size-changed", scheduleSave),
            window.connect("position-changed", scheduleSave),
            window.connect("unmanaged", () => {
                if (tracking.ready)
                    this._saveWindow(window);
                this._untrackWindow(window, tracking);
            }),
        );

        if (isNew && actor) {
            // Keep the first native-size/centered frame invisible. Once the first
            // frame arrives, restore the saved geometry before revealing the actor.
            if (tracking.originalOpacity > 0) {
                actor.set_opacity(0);
                tracking.actorSuppressed = true;
                // Shell's normal map animation can also change actor opacity.
                // Keep it suppressed until the restored geometry is ready.
                tracking.opacitySignalId = actor.connect("notify::opacity", () => {
                    if (tracking.actorSuppressed && actor.get_opacity() !== 0)
                        actor.set_opacity(0);
                });
            }

            tracking.firstFrameId = actor.connect("first-frame", () => {
                if (tracking.restoreSourceId || !this._trackedWindows.has(window))
                    return;

                tracking.restoreSourceId = GLib.idle_add(
                    GLib.PRIORITY_DEFAULT_IDLE,
                    () => {
                        tracking.restoreSourceId = 0;
                        if (this._trackedWindows.has(window))
                            this._beginInitialRestore(window, tracking, false);
                        return GLib.SOURCE_REMOVE;
                    },
                );
            });

            // A defensive fallback for windows whose first-frame signal is delayed
            // (for example, initially hidden or minimized windows).
            tracking.safetySourceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                FIRST_FRAME_TIMEOUT_MS,
                () => {
                    tracking.safetySourceId = 0;
                    if (this._trackedWindows.has(window))
                        this._beginInitialRestore(window, tracking, true);
                    return GLib.SOURCE_REMOVE;
                },
            );
            return;
        }

        // Existing windows may already have emitted first-frame, so preserve the
        // previous delayed restore behavior without hiding them.
        tracking.restoreSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            RESTORE_DELAY_MS,
            () => {
                tracking.restoreSourceId = 0;
                if (!this._trackedWindows.has(window))
                    return GLib.SOURCE_REMOVE;

                this._restoreWindow(window);
                tracking.ready = true;
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _beginInitialRestore(window, tracking, forceReveal) {
        if (!this._trackedWindows.has(window))
            return;

        if (tracking.safetySourceId) {
            GLib.Source.remove(tracking.safetySourceId);
            tracking.safetySourceId = 0;
        }

        tracking.restoreTarget = this._restoreWindow(window);
        if (!tracking.restoreTarget || forceReveal) {
            this._completeInitialPlacement(window, tracking);
            return;
        }

        if (this._geometryMatches(window, tracking.restoreTarget)) {
            this._completeInitialPlacement(window, tracking);
            return;
        }

        tracking.restoreDeadline = GLib.get_monotonic_time() +
            GEOMETRY_WAIT_TIMEOUT_MS * 1000;
        tracking.nextGeometryRetry = GLib.get_monotonic_time() +
            GEOMETRY_RETRY_INTERVAL_MS * 1000;
        tracking.restoreSourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            GEOMETRY_POLL_INTERVAL_MS,
            () => this._waitForRestoredGeometry(window, tracking),
        );
    }

    _waitForRestoredGeometry(window, tracking) {
        if (!this._trackedWindows.has(window)) {
            tracking.restoreSourceId = 0;
            return GLib.SOURCE_REMOVE;
        }

        if (this._geometryMatches(window, tracking.restoreTarget)) {
            tracking.restoreSourceId = 0;
            this._completeInitialPlacement(window, tracking);
            return GLib.SOURCE_REMOVE;
        }

        const now = GLib.get_monotonic_time();
        if (now >= tracking.restoreDeadline) {
            tracking.restoreSourceId = 0;
            this._completeInitialPlacement(window, tracking);
            return GLib.SOURCE_REMOVE;
        }

        // Mutter may ignore a geometry request issued too early on Wayland.
        // Retry modestly until the requested frame rectangle is acknowledged.
        if (now >= tracking.nextGeometryRetry) {
            this._requestGeometry(window, tracking.restoreTarget);
            tracking.nextGeometryRetry = now + GEOMETRY_RETRY_INTERVAL_MS * 1000;
        }

        return GLib.SOURCE_CONTINUE;
    }

    _completeInitialPlacement(window, tracking) {
        if (tracking.restoreSourceId) {
            GLib.Source.remove(tracking.restoreSourceId);
            tracking.restoreSourceId = 0;
        }
        if (tracking.safetySourceId) {
            GLib.Source.remove(tracking.safetySourceId);
            tracking.safetySourceId = 0;
        }
        if (tracking.actor && tracking.firstFrameId) {
            try {
                tracking.actor.disconnect(tracking.firstFrameId);
            } catch (error) {
                logError(error, "Window Control: не вдалося від'єднати сигнал першого кадру.");
            }
            tracking.firstFrameId = 0;
        }

        this._restoreActorOpacity(tracking);
        tracking.ready = true;
    }

    _restoreActorOpacity(tracking) {
        if (!tracking.actor || !tracking.actorSuppressed)
            return;

        if (tracking.opacitySignalId) {
            try {
                tracking.actor.disconnect(tracking.opacitySignalId);
            } catch (error) {
                logError(error, "Window Control: не вдалося від'єднати контроль прозорості.");
            }
            tracking.opacitySignalId = 0;
        }

        try {
            tracking.actor.set_opacity(tracking.originalOpacity);
        } catch (error) {
            logError(error, "Window Control: не вдалося відновити видимість вікна.");
        }
        tracking.actorSuppressed = false;
    }

    _untrackWindow(window, tracking) {
        this._trackedWindows.delete(window);
        if (tracking.restoreSourceId)
            GLib.Source.remove(tracking.restoreSourceId);
        if (tracking.saveSourceId)
            GLib.Source.remove(tracking.saveSourceId);
        if (tracking.safetySourceId)
            GLib.Source.remove(tracking.safetySourceId);
        if (tracking.actor && tracking.firstFrameId) {
            try {
                tracking.actor.disconnect(tracking.firstFrameId);
            } catch (error) {
                logError(error, "Window Control: не вдалося від'єднати сигнал першого кадру.");
            }
        }

        this._restoreActorOpacity(tracking);

        for (const id of tracking.signalIds) {
            try {
                window.disconnect(id);
            } catch (error) {
                logError(error, "Window Control: не вдалося від'єднати сигнал вікна.");
            }
        }
    }

    _windowKey(window) {
        const appId = this._windowTracker.get_window_app(window)?.get_id() ?? "";
        const wmClass = window.get_wm_class() ?? "";
        const wmClassInstance = window.get_wm_class_instance() ?? "";
        if (!appId && !wmClass && !wmClassInstance)
            return null;

        return JSON.stringify([
            appId,
            wmClass,
            wmClassInstance,
            window.get_role() ?? "",
            window.get_title() ?? "",
        ]);
    }

    _restoreWindow(window) {
        if (window.is_fullscreen() || window.is_maximized())
            return null;

        const restorePosition = this._settings.get_boolean("restore-position");
        const restoreSize = this._settings.get_boolean("restore-size");
        if (!restorePosition && !restoreSize)
            return null;

        const key = this._windowKey(window);
        const state = key ? this._windowStates[key] : null;
        if (!state || !Number.isInteger(state.monitor) ||
            !Number.isFinite(state.x) || !Number.isFinite(state.y) ||
            !Number.isInteger(state.width) || !Number.isInteger(state.height) ||
            state.width < 1 || state.height < 1)
            return null;

        const monitors = Main.layoutManager.monitors;
        if (monitors.length === 0)
            return null;

        const monitorIndex = restorePosition
            ? Math.min(Math.max(state.monitor, 0), monitors.length - 1)
            : window.get_monitor();
        const monitor = monitors[monitorIndex];
        if (!monitor)
            return null;

        const frame = window.get_frame_rect();
        const width = restoreSize ? Math.min(state.width, monitor.width) : frame.width;
        const height = restoreSize ? Math.min(state.height, monitor.height) : frame.height;
        const x = restorePosition
            ? Math.round(monitor.x + Math.min(1, Math.max(0, state.x)) *
                Math.max(0, monitor.width - width))
            : frame.x;
        const y = restorePosition
            ? Math.round(monitor.y + Math.min(1, Math.max(0, state.y)) *
                Math.max(0, monitor.height - height))
            : frame.y;
        const target = {x, y, width, height};

        this._requestGeometry(window, target);
        return target;
    }

    _requestGeometry(window, target) {
        if (this._geometryMatches(window, target))
            return;

        window.move_resize_frame(
            true,
            target.x,
            target.y,
            target.width,
            target.height,
        );
    }

    _geometryMatches(window, target) {
        if (!target)
            return false;

        const frame = window.get_frame_rect();
        return frame.x === target.x && frame.y === target.y &&
            frame.width === target.width && frame.height === target.height;
    }

    _saveWindow(window) {
        if (window.is_fullscreen() || window.is_maximized())
            return;

        const key = this._windowKey(window);
        const monitorIndex = window.get_monitor();
        const monitor = Main.layoutManager.monitors[monitorIndex];
        if (!key || !monitor)
            return;

        const frame = window.get_frame_rect();
        if (frame.width < 1 || frame.height < 1)
            return;

        this._windowStates[key] = {
            monitor: monitorIndex,
            x: Math.min(1, Math.max(0,
                (frame.x - monitor.x) / Math.max(1, monitor.width - frame.width))),
            y: Math.min(1, Math.max(0,
                (frame.y - monitor.y) / Math.max(1, monitor.height - frame.height))),
            width: frame.width,
            height: frame.height,
        };
        this._settings.set_string("window-states", JSON.stringify(this._windowStates));
    }
}
