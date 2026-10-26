import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from
    "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class WindowControlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const restoreGroup = new Adw.PreferencesGroup({
            title: "Відновлення",
        });
        const positionRow = new Adw.SwitchRow({
            title: "Відновлювати позицію вікна",
        });
        const sizeRow = new Adw.SwitchRow({
            title: "Відновлювати розмір вікна",
        });
        const exceptionsGroup = new Adw.PreferencesGroup({
            title: "Виключення",
        });
        const addExceptionRow = new Adw.ActionRow({
            title: "Додати програму до списку виключень",
        });
        const addButton = new Gtk.Button({
            label: "+",
            valign: Gtk.Align.CENTER,
            tooltip_text: "Додати програму",
        });
        const exceptionRows = [];

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

        addButton.connect("clicked", () => {
            this._chooseApplication(window, settings);
        });
        addExceptionRow.add_suffix(addButton);
        exceptionsGroup.add(addExceptionRow);

        const updateExceptionRows = () => {
            for (const row of exceptionRows)
                exceptionsGroup.remove(row);
            exceptionRows.length = 0;

            const applications = Gio.AppInfo.get_all();
            const excludedApps = settings.get_strv("excluded-apps");
            for (const appId of excludedApps) {
                const app = applications.find(candidate =>
                    candidate.get_id() === appId);
                const row = new Adw.ActionRow({
                    title: app?.get_display_name() ?? appId,
                    subtitle: app?.get_display_name() === appId
                        ? null
                        : appId,
                });
                const removeButton = new Gtk.Button({
                    label: "-",
                    valign: Gtk.Align.CENTER,
                    tooltip_text: "Видалити зі списку виключень",
                });

                removeButton.connect("clicked", () => {
                    settings.set_strv(
                        "excluded-apps",
                        settings.get_strv("excluded-apps")
                            .filter(id => id !== appId),
                    );
                });
                row.add_suffix(removeButton);
                exceptionsGroup.add(row);
                exceptionRows.push(row);
            }
        };

        settings.connect("changed::excluded-apps", updateExceptionRows);
        updateExceptionRows();

        restoreGroup.add(positionRow);
        restoreGroup.add(sizeRow);
        page.add(restoreGroup);
        page.add(exceptionsGroup);
        window.add(page);
    }

    _chooseApplication(window, settings) {
        const dialog = new Gtk.Dialog({
            title: "Додати програму до списку виключень",
            transient_for: window,
            modal: true,
        });
        const content = dialog.get_content_area();
        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: "Пошук програми",
            margin_top: 12,
            margin_start: 12,
            margin_end: 12,
        });
        const listBox = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
        });
        const appRows = new Map();
        const applications = Gio.AppInfo.get_all()
            .filter(app => app.get_id() && app.should_show())
            .sort((left, right) => left.get_display_name()
                .localeCompare(right.get_display_name()));

        for (const app of applications) {
            const row = new Gtk.ListBoxRow();
            const appBox = new Gtk.Box({
                spacing: 12,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            });
            const icon = app.get_icon();
            if (icon) {
                appBox.append(new Gtk.Image({
                    gicon: icon,
                    pixel_size: 24,
                }));
            }
            appBox.append(new Gtk.Label({
                label: app.get_display_name(),
                xalign: 0,
                hexpand: true,
            }));
            row.set_child(appBox);
            listBox.append(row);
            appRows.set(row, app);
        }

        listBox.set_filter_func(row => {
            const app = appRows.get(row);
            const query = searchEntry.text.trim().toLocaleLowerCase();
            return !query ||
                app.get_display_name().toLocaleLowerCase().includes(query) ||
                app.get_id().toLocaleLowerCase().includes(query);
        });
        searchEntry.connect("search-changed", () => listBox.invalidate_filter());

        const scrolledWindow = new Gtk.ScrolledWindow({
            hexpand: true,
            vexpand: true,
            min_content_height: 300,
            margin_start: 12,
            margin_end: 12,
            margin_bottom: 12,
        });
        scrolledWindow.set_child(listBox);
        content.append(searchEntry);
        content.append(scrolledWindow);
        dialog.set_default_size(480, 500);
        dialog.add_button("Скасувати", Gtk.ResponseType.CANCEL);
        const addDialogButton = dialog.add_button(
            "Додати",
            Gtk.ResponseType.ACCEPT,
        );
        addDialogButton.sensitive = false;
        listBox.connect("row-selected", (_list, row) => {
            addDialogButton.sensitive = row !== null;
        });

        dialog.connect("response", (_dialog, response) => {
            const selectedRow = listBox.get_selected_row();
            if (response === Gtk.ResponseType.ACCEPT && selectedRow) {
                const selectedApp = appRows.get(selectedRow);
                const excludedApps = settings.get_strv("excluded-apps");
                if (!excludedApps.includes(selectedApp.get_id())) {
                    settings.set_strv("excluded-apps", [
                        ...excludedApps,
                        selectedApp.get_id(),
                    ]);
                }
            }
            dialog.close();
        });
        dialog.present();
    }
}
