"""Main Altium Tools window with sidebar navigation."""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk

from gui.base import ToolPanel, ToolSpec
from gui.registry import discover_tools

APP_TITLE = "Altium Tools"
MIN_WIDTH = 720
MIN_HEIGHT = 520


class AltiumToolsApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(APP_TITLE)
        self.minsize(MIN_WIDTH, MIN_HEIGHT)
        self.geometry("900x600")

        self._tools = discover_tools()
        self._panels: dict[str, ToolPanel] = {}
        self._active_tool_id: str | None = None
        self._nav_buttons: dict[str, ttk.Button] = {}

        self._build_layout()
        if self._tools:
            self._show_tool(self._tools[0].id)
        else:
            self._show_empty_state()

    def _build_layout(self) -> None:
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        sidebar = ttk.Frame(self, padding=(8, 12), width=200)
        sidebar.grid(row=0, column=0, sticky="ns")
        sidebar.grid_propagate(False)

        ttk.Label(
            sidebar,
            text=APP_TITLE,
            font=("", 12, "bold"),
            wraplength=180,
        ).pack(anchor="w", pady=(0, 4))

        ttk.Label(
            sidebar,
            text="Utilities for Altium Designer",
            foreground="#555",
            wraplength=180,
        ).pack(anchor="w", pady=(0, 16))

        nav = ttk.Frame(sidebar)
        nav.pack(fill="x")

        for spec in self._tools:
            btn = ttk.Button(
                nav,
                text=spec.title,
                command=lambda sid=spec.id: self._show_tool(sid),
            )
            btn.pack(fill="x", pady=2)
            self._nav_buttons[spec.id] = btn

        ttk.Separator(sidebar, orient="horizontal").pack(fill="x", pady=16)
        ttk.Label(
            sidebar,
            text="Add tools in gui/tools/\n(see README)",
            foreground="#888",
            font=("", 8),
            wraplength=180,
        ).pack(anchor="w")

        main = ttk.Frame(self, padding=(0, 0, 12, 0))
        main.grid(row=0, column=1, sticky="nsew")
        main.columnconfigure(0, weight=1)
        main.rowconfigure(1, weight=1)

        self._tool_header = ttk.Label(main, text="", font=("", 14, "bold"))
        self._tool_header.grid(row=0, column=0, sticky="w", padx=12, pady=(12, 0))

        self._tool_blurb = ttk.Label(main, text="", foreground="#555", wraplength=600)
        self._tool_blurb.grid(row=0, column=0, sticky="w", padx=12, pady=(36, 8))

        self._content = ttk.Frame(main)
        self._content.grid(row=1, column=0, sticky="nsew", padx=0, pady=0)
        self._content.columnconfigure(0, weight=1)
        self._content.rowconfigure(0, weight=1)

        status_bar = ttk.Frame(self)
        status_bar.grid(row=1, column=0, columnspan=2, sticky="ew")
        status_bar.columnconfigure(0, weight=1)

        self._status = tk.StringVar(value="Ready")
        ttk.Label(
            status_bar,
            textvariable=self._status,
            padding=(12, 6),
            relief="sunken",
            anchor="w",
        ).grid(row=0, column=0, sticky="ew")

    def _show_empty_state(self) -> None:
        self._tool_header.configure(text="No tools installed")
        self._tool_blurb.configure(text="Add a module under gui/tools/ with PANEL_CLASS set.")
        ttk.Label(
            self._content,
            text="See README for how to register a new tool.",
        ).grid(padx=12, pady=12)

    def _show_tool(self, tool_id: str) -> None:
        spec = self._spec_for(tool_id)
        if spec is None:
            return

        for child in self._content.winfo_children():
            child.grid_forget()

        panel = self._panels.get(tool_id)
        if panel is None:
            panel = spec.panel_class(self._content, self)
            panel.build()
            panel.grid(row=0, column=0, sticky="nsew")
            self._content.rowconfigure(0, weight=1)
            self._panels[tool_id] = panel
        else:
            panel.grid(row=0, column=0, sticky="nsew")

        self._active_tool_id = tool_id
        self._tool_header.configure(text=spec.title)
        self._tool_blurb.configure(text=spec.description)
        panel.on_show()
        self._highlight_nav(tool_id)

    def _highlight_nav(self, tool_id: str) -> None:
        for tid, btn in self._nav_buttons.items():
            btn.state(["!disabled"])
            if tid == tool_id:
                btn.state(["disabled"])

    def _spec_for(self, tool_id: str) -> ToolSpec | None:
        for spec in self._tools:
            if spec.id == tool_id:
                return spec
        return None

    def set_status(self, message: str, *, is_error: bool = False) -> None:
        prefix = "Error: " if is_error else ""
        self._status.set(prefix + message)


def run() -> None:
    app = AltiumToolsApp()
    app.mainloop()
