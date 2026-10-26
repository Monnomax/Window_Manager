import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

const BUTTON_EXPORT_KEYS = [
    "show-minimize",
    "show-maximize",
    "show-close",
    "button-position",
];

export default class WindowControlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this._getSettingsAtPath(
            "/org/gnome/shell/extensions/window-manager/",
        );
        const page = new Adw.PreferencesPage({
            title: "Позиція та розмір",
        });
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
            for (const row of exceptionRows) exceptionsGroup.remove(row);
            exceptionRows.length = 0;

            const applications = Gio.AppInfo.get_all();
            const excludedApps = settings.get_strv("excluded-apps");
            for (const appId of excludedApps) {
                const app = applications.find(
                    (candidate) => candidate.get_id() === appId,
                );
                const row = new Adw.ActionRow({
                    title: app?.get_display_name() ?? appId,
                    subtitle: app?.get_display_name() === appId ? null : appId,
                });
                const removeButton = new Gtk.Button({
                    label: "-",
                    valign: Gtk.Align.CENTER,
                    tooltip_text: "Видалити зі списку виключень",
                });

                removeButton.connect("clicked", () => {
                    settings.set_strv(
                        "excluded-apps",
                        settings
                            .get_strv("excluded-apps")
                            .filter((id) => id !== appId),
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

        const buttonSettings = this._getSettingsAtPath(
            "/org/gnome/shell/extensions/window-buttons-control/",
        );
        window.add(this._buildButtonsPage(window, buttonSettings));

        const switcherSettings = this._getSettingsAtPath(
            "/org/gnome/shell/extensions/window-switcher/",
        );
        window.add(this._buildSwitcherPage(switcherSettings));
    }

    _getSettingsAtPath(path) {
        if (!this._settingsSchemaSource) {
            this._settingsSchemaSource =
                Gio.SettingsSchemaSource.new_from_directory(
                    this.dir.get_child("schemas").get_path(),
                    Gio.SettingsSchemaSource.get_default(),
                    false,
                );

            this._settingsSchema = this._settingsSchemaSource.lookup(
                "org.gnome.shell.extensions.window-manager",
                false,
            );
        }

        if (!this._settingsSchema)
            throw new Error(
                "Window Manager: combined settings schema not found.",
            );

        return new Gio.Settings({
            settings_schema: this._settingsSchema,
            path,
        });
    }

    _buildButtonsPage(window, settings) {
        const page = new Adw.PreferencesPage({
            title: "Кнопки вікна",
        });
        const buttonsGroup = new Adw.PreferencesGroup({
            title: "Кнопки керування вікном",
        });

        for (const [key, title] of [
            ["show-minimize", "Згорнути"],
            ["show-maximize", "Розгорнути"],
            ["show-close", "Закрити"],
        ]) {
            const row = new Adw.SwitchRow({ title });
            settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
            buttonsGroup.add(row);
        }

        const positionGroup = new Adw.PreferencesGroup({
            title: "Позиція кнопок",
        });
        const positionRow = new Adw.ActionRow({
            title: "Місце розташування кнопок",
        });
        const positionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            valign: Gtk.Align.CENTER,
            homogeneous: true,
            css_classes: ["linked"],
        });
        const leftButton = new Gtk.ToggleButton({
            label: "Зліва",
            valign: Gtk.Align.CENTER,
        });
        const rightButton = new Gtk.ToggleButton({
            label: "Справа",
            valign: Gtk.Align.CENTER,
        });
        positionBox.append(leftButton);
        positionBox.append(rightButton);

        const setPosition = (position) => {
            const isLeft = position === "left";
            if (leftButton.active !== isLeft) leftButton.set_active(isLeft);
            if (rightButton.active !== !isLeft) rightButton.set_active(!isLeft);
        };
        leftButton.connect("toggled", () => {
            if (leftButton.active)
                settings.set_string("button-position", "left");
        });
        rightButton.connect("toggled", () => {
            if (rightButton.active)
                settings.set_string("button-position", "right");
        });
        settings.connect("changed::button-position", () =>
            setPosition(settings.get_string("button-position")),
        );
        setPosition(settings.get_string("button-position"));
        positionRow.add_suffix(positionBox);
        positionRow.set_activatable_widget(leftButton);
        positionGroup.add(positionRow);

        const actionsGroup = new Adw.PreferencesGroup({
            title: "Налаштування",
        });
        const actionsRow = new Adw.ActionRow({
            title: "Дії з налаштуваннями",
        });
        const buttonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });
        const importButton = new Gtk.Button({
            label: "Імпорт",
            valign: Gtk.Align.CENTER,
        });
        importButton.connect("clicked", () =>
            this._onButtonImport(window, settings),
        );
        const exportButton = new Gtk.Button({
            label: "Експорт",
            valign: Gtk.Align.CENTER,
        });
        exportButton.connect("clicked", () =>
            this._onButtonExport(window, settings),
        );
        const resetButton = new Gtk.Button({
            label: "Скинути",
            valign: Gtk.Align.CENTER,
            css_classes: ["destructive-action"],
        });
        resetButton.connect("clicked", () =>
            this._onButtonReset(window, settings),
        );
        buttonsBox.append(importButton);
        buttonsBox.append(exportButton);
        buttonsBox.append(resetButton);
        actionsRow.add_suffix(buttonsBox);
        actionsGroup.add(actionsRow);

        page.add(buttonsGroup);
        page.add(positionGroup);
        page.add(actionsGroup);
        return page;
    }

    _buildSwitcherPage(settings) {
        const page = new Adw.PreferencesPage({
            title: "Перемикання",
        });
        const group = new Adw.PreferencesGroup({
            title: "Зона чутливості",
        });
        const showRow = new Adw.SwitchRow({
            title: "Показувати зону чутливості",
        });
        settings.bind(
            "show-indicator",
            showRow,
            "active",
            Gio.SettingsBindFlags.DEFAULT,
        );
        group.add(showRow);
        this._addSwitcherSliderRow(
            group,
            settings,
            "height",
            "Висота",
            1,
            50,
            1,
        );
        this._addSwitcherSliderRow(
            group,
            settings,
            "width-percent",
            "Ширина",
            10,
            100,
            5,
        );
        page.add(group);
        return page;
    }

    _addSwitcherSliderRow(
        target,
        settings,
        key,
        title,
        lower,
        upper,
        stepIncrement,
    ) {
        const row = new Adw.ActionRow({ title });
        const button = new Gtk.Button({
            label: settings.get_int(key).toString(),
            valign: Gtk.Align.CENTER,
        });
        button.set_size_request(72, -1);
        const adjustment = new Gtk.Adjustment({
            lower,
            upper,
            step_increment: stepIncrement,
            value: settings.get_int(key),
        });
        const scrollController = new Gtk.EventControllerScroll({
            flags: Gtk.EventControllerScrollFlags.VERTICAL,
        });
        scrollController.connect("scroll", (_controller, _dx, dy) => {
            adjustment.value = Math.max(
                adjustment.lower,
                Math.min(
                    adjustment.upper,
                    adjustment.value - dy * adjustment.step_increment,
                ),
            );
            return true;
        });
        button.add_controller(scrollController);
        adjustment.connect("value-changed", () => {
            const value = Math.round(adjustment.value);
            button.label = value.toString();
            settings.set_int(key, value);
        });
        settings.connect(`changed::${key}`, () => {
            const value = settings.get_int(key);
            button.label = value.toString();
            adjustment.value = value;
        });
        row.add_suffix(button);
        target.add(row);
    }

    _onButtonExport(window, settings) {
        const data = {};
        for (const key of BUTTON_EXPORT_KEYS)
            data[key] = settings.get_value(key).deep_unpack();

        const dialog = new Gtk.FileDialog({
            title: "Експорт налаштувань",
            initial_name: "window-buttons-control.json",
        });
        dialog.save(window, null, (source, result) => {
            try {
                const file = source.save_finish(result);
                file.replace_contents(
                    JSON.stringify(data, null, 2),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
                );
            } catch (error) {
                if (!error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(error, "Не вдалося експортувати налаштування");
            }
        });
    }

    _onButtonImport(window, settings) {
        const dialog = new Gtk.FileDialog({
            title: "Імпорт налаштувань",
        });
        const filter = new Gtk.FileFilter();
        filter.add_pattern("*.json");
        filter.set_name("JSON файли");
        const filters = new Gio.ListStore();
        filters.append(filter);
        dialog.set_filters(filters);
        dialog.open(window, null, (source, result) => {
            try {
                const file = source.open_finish(result);
                const [ok, contents] = file.load_contents(null);
                if (!ok) return;
                const data = JSON.parse(
                    new TextDecoder("utf-8").decode(contents),
                );
                if (typeof data["show-minimize"] === "boolean")
                    settings.set_boolean(
                        "show-minimize",
                        data["show-minimize"],
                    );
                if (typeof data["show-maximize"] === "boolean")
                    settings.set_boolean(
                        "show-maximize",
                        data["show-maximize"],
                    );
                if (typeof data["show-close"] === "boolean")
                    settings.set_boolean("show-close", data["show-close"]);
                if (
                    data["button-position"] === "left" ||
                    data["button-position"] === "right"
                )
                    settings.set_string(
                        "button-position",
                        data["button-position"],
                    );
            } catch (error) {
                if (
                    !error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED)
                ) {
                    logError(error, "Не вдалося імпортувати налаштування");
                    this._showButtonError(
                        window,
                        "Не вдалося імпортувати файл налаштувань.",
                    );
                }
            }
        });
    }

    _onButtonReset(window, settings) {
        const dialog = new Adw.AlertDialog({
            heading: "Скинути налаштування?",
            body:
                "Усі кнопки керування вікном та їх розташування повернуться " +
                "до значень за замовчуванням.",
        });
        dialog.add_response("cancel", "Скасувати");
        dialog.add_response("reset", "Скинути");
        dialog.set_response_appearance(
            "reset",
            Adw.ResponseAppearance.DESTRUCTIVE,
        );
        dialog.set_default_response("cancel");
        dialog.set_close_response("cancel");
        dialog.connect("response", (_dialog, response) => {
            if (response === "reset") {
                for (const key of BUTTON_EXPORT_KEYS) settings.reset(key);
            }
        });
        dialog.present(window);
    }

    _showButtonError(window, message) {
        const dialog = new Adw.AlertDialog({
            heading: "Помилка",
            body: message,
        });
        dialog.add_response("ok", "Гаразд");
        dialog.present(window);
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
            .filter((app) => app.get_id() && app.should_show())
            .sort((left, right) =>
                left.get_display_name().localeCompare(right.get_display_name()),
            );

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
                appBox.append(
                    new Gtk.Image({
                        gicon: icon,
                        pixel_size: 24,
                    }),
                );
            }
            appBox.append(
                new Gtk.Label({
                    label: app.get_display_name(),
                    xalign: 0,
                    hexpand: true,
                }),
            );
            row.set_child(appBox);
            listBox.append(row);
            appRows.set(row, app);
        }

        listBox.set_filter_func((row) => {
            const app = appRows.get(row);
            const query = searchEntry.text.trim().toLocaleLowerCase();
            return (
                !query ||
                app.get_display_name().toLocaleLowerCase().includes(query) ||
                app.get_id().toLocaleLowerCase().includes(query)
            );
        });
        searchEntry.connect("search-changed", () =>
            listBox.invalidate_filter(),
        );

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
