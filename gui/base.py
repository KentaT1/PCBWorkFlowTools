"""Base types for pluggable tool panels."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

import tkinter as tk
from tkinter import ttk

if TYPE_CHECKING:
    from gui.app import AltiumToolsApp


@dataclass(frozen=True)
class ToolSpec:
    """Metadata for a tool shown in the sidebar."""

    id: str
    title: str
    description: str
    panel_class: type[ToolPanel]


class ToolPanel(ttk.Frame, ABC):
    """One tool's UI; subclass and register via gui.tools."""

    tool_id: str = ""
    tool_title: str = ""
    tool_description: str = ""

    def __init__(self, parent: tk.Misc, app: AltiumToolsApp) -> None:
        super().__init__(parent, padding=12)
        self.app = app
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

    @classmethod
    def spec(cls) -> ToolSpec:
        return ToolSpec(
            id=cls.tool_id,
            title=cls.tool_title,
            description=cls.tool_description,
            panel_class=cls,
        )

    @abstractmethod
    def build(self) -> None:
        """Create widgets inside this frame."""

    def on_show(self) -> None:
        """Called when the user selects this tool in the sidebar."""

    def set_status(self, message: str, *, is_error: bool = False) -> None:
        self.app.set_status(message, is_error=is_error)
