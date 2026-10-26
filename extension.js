import Gio from "gi://Gio";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import WindowButtons from "./src/window-buttons.js";
import WindowState from "./src/window-state.js";
import WindowSwitcher from "./src/window-switcher.js";

const SETTINGS_SCHEMA_ID = "org.gnome.shell.extensions.window-manager";

const SETTINGS_PATHS = {
    windowState: "/org/gnome/shell/extensions/window-manager/",
    windowButtons: "/org/gnome/shell/extensions/window-buttons-control/",
    windowSwitcher: "/org/gnome/shell/extensions/window-switcher/",
};

export default class WindowControlExtension extends Extension {
    enable() {
        this._settingsSchemaSource =
            Gio.SettingsSchemaSource.new_from_directory(
                this.dir.get_child("schemas").get_path(),
                Gio.SettingsSchemaSource.get_default(),
                false,
            );

        this._settingsSchema = this._settingsSchemaSource.lookup(
            SETTINGS_SCHEMA_ID,
            false,
        );

        if (!this._settingsSchema)
            throw new Error(
                `Window Manager: schema '${SETTINGS_SCHEMA_ID}' not found.`,
            );

        this._windowState = new WindowState(
            this._getSettingsAtPath(SETTINGS_PATHS.windowState),
        );

        this._windowButtons = new WindowButtons(
            this._getSettingsAtPath(SETTINGS_PATHS.windowButtons),
        );

        this._windowSwitcher = new WindowSwitcher(
            this._getSettingsAtPath(SETTINGS_PATHS.windowSwitcher),
        );

        this._windowState.enable();
        this._windowButtons.enable();
        this._windowSwitcher.enable();
    }

    disable() {
        this._windowSwitcher.disable();
        this._windowButtons.disable();
        this._windowState.disable();

        this._windowSwitcher = null;
        this._windowButtons = null;
        this._windowState = null;
        this._settingsSchema = null;
        this._settingsSchemaSource = null;
    }

    _getSettingsAtPath(path) {
        return new Gio.Settings({
            settings_schema: this._settingsSchema,
            path,
        });
    }
}
