import Adw from "gi://Adw";
import Gio from "gi://Gio";
import { ExtensionPreferences } from
    "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class WindowControlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: "Відновлення",
        });
        const positionRow = new Adw.SwitchRow({
            title: "Відновлювати позицію вікна",
        });
        const sizeRow = new Adw.SwitchRow({
            title: "Відновлювати розмір вікна",
        });

        settings.bind(
            "restore-position",
            positionRow,
            "active",
            Gio.SettingsBindFlags.DEFAULT,
        );
        settings.bind(
            "restore-size",
            sizeRow,
            "active",
            Gio.SettingsBindFlags.DEFAULT,
        );

        group.add(positionRow);
        group.add(sizeRow);
        page.add(group);
        window.add(page);
    }
}
