import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const RESTORE_DELAY_MS = 700;
const SAVE_DELAY_MS = 250;
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

        this._windowCreatedId = global.display.connect_after(
            "window-created",
            (_display, window) => this._trackWindow(window),
        );

        for (const actor of global.get_window_actors())
            this._trackWindow(actor.meta_window);
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = 0;
        }

        for (const [window, tracking] of this._trackedWindows) {
            if (tracking.ready)
                this._saveWindow(window);

            if (tracking.restoreSourceId)
                GLib.Source.remove(tracking.restoreSourceId);
            if (tracking.saveSourceId)
                GLib.Source.remove(tracking.saveSourceId);
            for (const id of tracking.signalIds)
                window.disconnect(id);
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

    _trackWindow(window) {
        if (this._trackedWindows.has(window) ||
            !WINDOW_TYPES.has(window.get_window_type()))
            return;

        const tracking = {
            ready: false,
            restoreSourceId: 0,
            saveSourceId: 0,
            signalIds: [],
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

    _untrackWindow(window, tracking) {
        this._trackedWindows.delete(window);
        if (tracking.restoreSourceId)
            GLib.Source.remove(tracking.restoreSourceId);
        if (tracking.saveSourceId)
            GLib.Source.remove(tracking.saveSourceId);

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
            return;

        const key = this._windowKey(window);
        const state = key ? this._windowStates[key] : null;
        if (!state || !Number.isInteger(state.monitor) ||
            !Number.isFinite(state.x) || !Number.isFinite(state.y) ||
            !Number.isInteger(state.width) || !Number.isInteger(state.height) ||
            state.width < 1 || state.height < 1)
            return;

        const monitors = Main.layoutManager.monitors;
        if (monitors.length === 0)
            return;

        const monitorIndex = Math.min(Math.max(state.monitor, 0), monitors.length - 1);
        const monitor = monitors[monitorIndex];
        const width = Math.min(state.width, monitor.width);
        const height = Math.min(state.height, monitor.height);
        const xRatio = Math.min(1, Math.max(0, state.x));
        const yRatio = Math.min(1, Math.max(0, state.y));
        const x = Math.round(monitor.x + xRatio * Math.max(0, monitor.width - width));
        const y = Math.round(monitor.y + yRatio * Math.max(0, monitor.height - height));
        const frame = window.get_frame_rect();

        if (frame.x !== x || frame.y !== y ||
            frame.width !== width || frame.height !== height)
            window.move_resize_frame(true, x, y, width, height);
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
