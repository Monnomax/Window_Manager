import Gio from "gi://Gio";

const WM_SCHEMA = "org.gnome.desktop.wm.preferences";
const WM_KEY = "button-layout";

export default class WindowButtons {
    constructor(settings) {
        this._settings = settings;
        this._wmSettings = null;
        this._settingsChangedId = 0;
        this._wmChangedId = 0;
    }

    enable() {
        this._wmSettings = new Gio.Settings({ schema_id: WM_SCHEMA });

        if (!this._settings.get_boolean("has-original-button-layout")) {
            this._settings.set_string(
                "original-button-layout",
                this._wmSettings.get_string(WM_KEY),
            );
            this._settings.set_boolean("has-original-button-layout", true);
        }

        this._applyLayout();

        this._settingsChangedId = this._settings.connect(
            "changed",
            (_settings, key) => {
                if (
                    key === "original-button-layout" ||
                    key === "has-original-button-layout"
                )
                    return;
                this._applyLayout();
            },
        );

        this._wmChangedId = this._wmSettings.connect(
            `changed::${WM_KEY}`,
            () => this._applyLayout(),
        );
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._wmChangedId) {
            this._wmSettings.disconnect(this._wmChangedId);
            this._wmChangedId = 0;
        }

        if (this._settings.get_boolean("has-original-button-layout")) {
            const original = this._settings.get_string(
                "original-button-layout",
            );
            this._wmSettings.set_string(WM_KEY, original);
            this._settings.set_boolean("has-original-button-layout", false);
        }

        this._wmSettings = null;
    }

    _buildLayout() {
        const buttons = [];
        if (this._settings.get_boolean("show-minimize"))
            buttons.push("minimize");
        if (this._settings.get_boolean("show-maximize"))
            buttons.push("maximize");
        if (this._settings.get_boolean("show-close"))
            buttons.push("close");

        const position = this._settings.get_string("button-position");
        if (position === "left")
            buttons.reverse();

        const layout = buttons.join(",");
        return position === "left" ? `${layout}:` : `:${layout}`;
    }

    _applyLayout() {
        const layout = this._buildLayout();
        if (this._wmSettings.get_string(WM_KEY) !== layout)
            this._wmSettings.set_string(WM_KEY, layout);
    }
}
