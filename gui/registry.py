"""Discover and register tool panels."""

from __future__ import annotations

import importlib
import pkgutil
from gui.base import ToolSpec


def discover_tools() -> list[ToolSpec]:
    """
    Load all tools from gui.tools.

    To add a tool: create gui/tools/my_tool.py with a ToolPanel subclass
    that sets tool_id, tool_title, tool_description, and implements build().
    """
    import gui.tools as tools_package

    specs: list[ToolSpec] = []
    for module_info in pkgutil.iter_modules(tools_package.__path__):
        if module_info.name.startswith("_"):
            continue
        module = importlib.import_module(f"gui.tools.{module_info.name}")
        panel_class = getattr(module, "PANEL_CLASS", None)
        if panel_class is not None:
            specs.append(panel_class.spec())
    return sorted(specs, key=lambda s: s.title.lower())
