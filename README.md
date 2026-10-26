# Window Control

GNOME Shell 50 extension that remembers the size, position, and monitor of
normal, dialog, modal-dialog, and utility windows. Geometry is saved per
application/window identity and restored when the window is opened again.
Positions are kept relative to the monitor's usable area, while window sizes
remain in logical pixels. Restored windows are kept within the monitor bounds.

To install this source tree, copy or symlink `window-control@local` into
`~/.local/share/gnome-shell/extensions/`, then compile its settings schema:

```sh
glib-compile-schemas ~/.local/share/gnome-shell/extensions/window-control@local/schemas
```

Enable it with:

```sh
gnome-extensions enable window-control@local
```

If GNOME Shell was already running when the extension was installed, log out
and back in before enabling it so Shell discovers the new extension.
