The appearance menu (`titlebar.right`) and palette commands (`Toggle light and dark theme`, `Change theme and fonts…`) for switching color themes, UI font, and code/terminal font.

Theme and font choices are per-browser preferences kept in `localStorage` (`ultimate.theme`, `ultimate.theme.preset`, `ultimate.font.ui`, `ultimate.font.code`) and applied to `document.documentElement` (`data-theme`, `.dark`, `--font-sans`, `--font-mono`) before first paint.
