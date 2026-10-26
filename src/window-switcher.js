import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export default class WindowSwitcher {
    constructor(settings) {
        this._settings = settings;
        this._bottomBinding = null;
        this._settingsIds = [];
        this._monitorsChangedId = 0;
    }

    enable() {
        this._bottomBinding = new St.Widget({
            name: "bottom-scroll-area",
            reactive: true,
            visible: true,
            can_focus: false,
            track_hover: true,
        });

        Main.layoutManager.addTopChrome(this._bottomBinding, {
            trackFullscreen: false,
        });

        this._updatePosition();
        this._updateStyle();

        this._settingsIds = [
            this._settings.connect("changed::height", () =>
                this._updatePosition(),
            ),
            this._settings.connect("changed::width-percent", () =>
                this._updatePosition(),
            ),
            this._settings.connect("changed::show-indicator", () =>
                this._updateStyle(),
            ),
        ];

        this._monitorsChangedId = Main.layoutManager.connect(
            "monitors-changed",
            () => this._updatePosition(),
        );

        this._bottomBinding.connect("scroll-event", (_actor, event) => {
            const direction = event.get_scroll_direction();
            const display = global.display;
            const workspace = display
                .get_workspace_manager()
                .get_active_workspace();

            const windows = display.get_tab_list(0, workspace);
            if (windows.length < 2)
                return Clutter.EVENT_PROPAGATE;

            let targetWindow;
            if (direction === Clutter.ScrollDirection.UP)
                targetWindow = windows[windows.length - 1];
            else if (direction === Clutter.ScrollDirection.DOWN)
                targetWindow = windows[1];

            if (targetWindow)
                targetWindow.activate(global.get_current_time());

            return Clutter.EVENT_STOP;
        });
    }

    _updateStyle() {
        if (!this._bottomBinding)
            return;

        const show = this._settings.get_boolean("show-indicator");
        if (show) {
            this._bottomBinding.set_style(
                "background-color: rgba(255, 255, 255, 0.5);",
            );
        } else {
            this._bottomBinding.set_style(
                "background-color: rgba(0,0,0,0); border: none;",
            );
        }
        this._bottomBinding.set_opacity(255);
    }

    _updatePosition() {
        if (!this._bottomBinding)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const height = this._settings.get_int("height");
        const widthPercent = this._settings.get_int("width-percent");
        const width = monitor.width * widthPercent / 100;
        const x = (monitor.width - width) / 2;

        this._bottomBinding.set_size(width, height);
        this._bottomBinding.set_position(x, monitor.height - height);

        const parent = this._bottomBinding.get_parent();
        if (parent)
            parent.set_child_above_sibling(this._bottomBinding, null);
    }

    disable() {
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];

        if (this._bottomBinding) {
            Main.layoutManager.removeChrome(this._bottomBinding);
            this._bottomBinding.destroy();
            this._bottomBinding = null;
        }
    }
}
