"""Side-by-side columns for easy per-column copy into Altium."""

from __future__ import annotations

import tkinter as tk
from collections.abc import Callable
from tkinter import ttk


class ColumnCopyView(ttk.Frame):
    """
    Displays tabular data as separate columns.

    Each column has a header, a Copy column button (newline-separated values),
    and a list box. All columns scroll together.
    """

    def __init__(self, parent: tk.Misc, **kwargs) -> None:
        super().__init__(parent, **kwargs)
        self._columns: dict[str, list[str]] = {}
        self._listboxes: list[tk.Listbox] = []
        self._body: ttk.Frame | None = None
        self._scroll: ttk.Scrollbar | None = None
        self._count_label: ttk.Label | None = None
        self._on_copy: Callable[[str], None] | None = None
        self._syncing = False

        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        ttk.Label(
            self,
            text="Copy one column at a time into Symbol Wizard (Designator, Display Name, etc.).",
            foreground="#555",
        ).grid(row=0, column=0, sticky="w", pady=(0, 8))

        self._table_host = ttk.Frame(self)
        self._table_host.grid(row=1, column=0, sticky="nsew")
        self._table_host.columnconfigure(0, weight=1)
        self._table_host.rowconfigure(0, weight=1)

        self._count_label = ttk.Label(self, text="", foreground="#555")
        self._count_label.grid(row=2, column=0, sticky="w", pady=(8, 0))

    def set_copy_callback(self, callback: Callable[[str], None]) -> None:
        self._on_copy = callback

    def clear(self) -> None:
        self._columns = {}
        self._listboxes = []
        if self._body is not None:
            self._body.destroy()
            self._body = None
        if self._scroll is not None:
            self._scroll.destroy()
            self._scroll = None
        if self._count_label is not None:
            self._count_label.configure(text="")

    def set_columns(self, columns: dict[str, list[str]]) -> None:
        """Replace the view with new column data (all columns same length)."""
        self.clear()
        if not columns:
            return

        self._columns = {name: list(values) for name, values in columns.items()}
        lengths = {len(v) for v in self._columns.values()}
        if len(lengths) > 1:
            raise ValueError("All columns must have the same number of rows")

        row_count = next(iter(lengths)) if lengths else 0

        self._body = ttk.Frame(self._table_host)
        self._body.grid(row=0, column=0, sticky="nsew")
        self._body.rowconfigure(1, weight=1)

        self._scroll = ttk.Scrollbar(self._table_host, orient="vertical")
        self._scroll.grid(row=0, column=1, sticky="ns")
        self._scroll.configure(command=self._on_scrollbar)

        col_index = 0
        for name, values in self._columns.items():
            col_frame = ttk.Frame(self._body, padding=(0, 0, 10, 0))
            col_frame.grid(row=0, column=col_index, sticky="nsew")
            col_frame.rowconfigure(2, weight=1)

            ttk.Label(col_frame, text=name, font=("", 10, "bold")).grid(
                row=0, column=0, sticky="w"
            )
            ttk.Button(
                col_frame,
                text="Copy column",
                command=lambda n=name: self._copy_column(n),
            ).grid(row=1, column=0, sticky="w", pady=(4, 6))

            width = max(12, min(32, max((len(v) for v in values), default=10) + 2))
            listbox = tk.Listbox(
                col_frame,
                font=("Consolas", 10),
                width=width,
                exportselection=False,
                activestyle="none",
                selectmode="extended",
            )
            listbox.grid(row=2, column=0, sticky="nsew")
            for value in values:
                listbox.insert(tk.END, value)

            listbox.configure(
                yscrollcommand=lambda f, l, lb=listbox: self._on_listbox_scroll(lb, f, l)
            )
            listbox.bind("<MouseWheel>", self._on_mousewheel)
            listbox.bind("<Button-4>", self._on_mousewheel_linux)
            listbox.bind("<Button-5>", self._on_mousewheel_linux)

            self._listboxes.append(listbox)
            col_index += 1

        if self._count_label is not None:
            self._count_label.configure(
                text=f"{row_count} pins — click a column list and Ctrl+A, Ctrl+C, or use Copy column"
            )

    def _on_scrollbar(self, *args) -> None:
        if self._syncing:
            return
        self._syncing = True
        try:
            for listbox in self._listboxes:
                listbox.yview(*args)
        finally:
            self._syncing = False

    def _on_listbox_scroll(self, source: tk.Listbox, first: str, last: str) -> None:
        if self._syncing:
            return
        self._syncing = True
        try:
            if self._scroll is not None:
                self._scroll.set(first, last)
            pos = float(first)
            for listbox in self._listboxes:
                if listbox is not source:
                    listbox.yview_moveto(pos)
        finally:
            self._syncing = False

    def _on_mousewheel(self, event: tk.Event) -> str:
        delta = -1 * (event.delta // 120)
        self._scroll_all_units(delta)
        return "break"

    def _on_mousewheel_linux(self, event: tk.Event) -> str:
        delta = -1 if event.num == 4 else 1
        self._scroll_all_units(delta)
        return "break"

    def _scroll_all_units(self, delta: int) -> None:
        if not self._listboxes:
            return
        self._listboxes[0].yview_scroll(delta, "units")
        pos = self._listboxes[0].yview()
        if self._scroll is not None:
            self._scroll.set(*pos)
        for listbox in self._listboxes[1:]:
            listbox.yview_moveto(pos[0])

    def _copy_column(self, name: str) -> None:
        values = self._columns.get(name, [])
        if not values:
            return
        text = "\n".join(values)
        root = self.winfo_toplevel()
        root.clipboard_clear()
        root.clipboard_append(text)
        if self._on_copy is not None:
            self._on_copy(f"Copied {len(values)} rows from “{name}”")

    def as_tsv(self) -> str:
        if not self._columns:
            return ""
        names = list(self._columns.keys())
        rows = zip(*(self._columns[n] for n in names))
        lines = ["\t".join(names)]
        lines.extend("\t".join(row) for row in rows)
        return "\n".join(lines)

    def has_data(self) -> bool:
        return bool(self._columns)
