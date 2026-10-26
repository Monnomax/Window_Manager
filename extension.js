import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import WindowButtons from "./src/window-buttons.js";
import WindowState from "./src/window-state.js";
import WindowSwitcher from "./src/window-switcher.js";

export default class WindowControlExtension extends Extension {
    enable() {
        this._windowState = new WindowState(this.getSettings());
        this._windowButtons = new WindowButtons(
            this.getSettings("org.gnome.shell.extensions.window-buttons-control"),
        );
        this._windowSwitcher = new WindowSwitcher(
            this.getSettings("org.gnome.shell.extensions.window-switcher"),
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
    }
}
