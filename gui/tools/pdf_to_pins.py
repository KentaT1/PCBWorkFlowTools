"""PDF pin table → Altium Symbol Wizard TSV."""

from __future__ import annotations

import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from gui.base import ToolPanel
from gui.widgets.column_view import ColumnCopyView
from pdf_to_altium_pins import OutputPin, convert_pdf


class PdfToPinsPanel(ToolPanel):
    tool_id = "pdf_to_pins"
    tool_title = "PDF → Pin Table"
    tool_description = "Convert datasheet pin PDFs to Altium Symbol Wizard TSV."

    def build(self) -> None:
        self._pdf_path = tk.StringVar()
        self._include_pin_name = tk.BooleanVar(value=False)
        self._pins: list[OutputPin] = []

        header = ttk.Frame(self)
        header.grid(row=0, column=0, sticky="ew")
        header.columnconfigure(0, weight=1)

        ttk.Label(header, text="Input PDF", font=("", 10, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 6)
        )

        file_row = ttk.Frame(header)
        file_row.grid(row=1, column=0, sticky="ew")
        file_row.columnconfigure(0, weight=1)

        ttk.Entry(file_row, textvariable=self._pdf_path).grid(
            row=0, column=0, sticky="ew", padx=(0, 8)
        )
        ttk.Button(file_row, text="Browse…", command=self._browse_pdf).grid(
            row=0, column=1
        )

        opts = ttk.Frame(header)
        opts.grid(row=2, column=0, sticky="w", pady=(10, 0))
        ttk.Checkbutton(
            opts,
            text="Include Pin Name column",
            variable=self._include_pin_name,
            command=self._refresh_columns,
        ).pack(side="left")

        actions = ttk.Frame(header)
        actions.grid(row=3, column=0, sticky="w", pady=(12, 0))
        ttk.Button(actions, text="Convert", command=self._convert).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(actions, text="Copy all (TSV)", command=self._copy_all).pack(
            side="left", padx=(0, 8)
        )
        ttk.Button(actions, text="Save as…", command=self._save).pack(side="left")

        self._columns = ColumnCopyView(self)
        self._columns.set_copy_callback(self.set_status)
        self._columns.grid(row=1, column=0, sticky="nsew", pady=(16, 0))
        self.rowconfigure(1, weight=1)

    def _pins_to_columns(self, pins: list[OutputPin]) -> dict[str, list[str]]:
        columns: dict[str, list[str]] = {
            "Designator": [str(p.designator) for p in pins],
            "Display Name": [p.display_name for p in pins],
            "Electrical Type": [p.electrical_type for p in pins],
        }
        if self._include_pin_name.get():
            columns["Pin Name"] = [p.pin_name for p in pins]
        return columns

    def _refresh_columns(self) -> None:
        if self._pins:
            self._columns.set_columns(self._pins_to_columns(self._pins))

    def _browse_pdf(self) -> None:
        path = filedialog.askopenfilename(
            title="Select pin definition PDF",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
        )
        if path:
            self._pdf_path.set(path)

    def _convert(self) -> None:
        path = Path(self._pdf_path.get().strip())
        if not path.is_file():
            messagebox.showerror("PDF → Pin Table", "Please choose a valid PDF file.")
            return

        try:
            pins = convert_pdf(path)
            if not pins:
                messagebox.showerror(
                    "PDF → Pin Table",
                    "No pin rows found. The PDF may not contain a recognized pin table.",
                )
                return
        except Exception as exc:
            messagebox.showerror("PDF → Pin Table", str(exc))
            self.set_status(f"Error: {exc}", is_error=True)
            return

        self._pins = pins
        self._columns.set_columns(self._pins_to_columns(pins))
        self.set_status(f"Converted {len(pins)} pins from {path.name}")

    def _copy_all(self) -> None:
        text = self._columns.as_tsv()
        if not text:
            messagebox.showinfo("PDF → Pin Table", "Convert a PDF first.")
            return
        self.clipboard_clear()
        self.clipboard_append(text)
        self.set_status("Copied full table (TSV) — use Smart Paste for multiple columns at once")

    def _save(self) -> None:
        text = self._columns.as_tsv()
        if not text:
            messagebox.showinfo("PDF → Pin Table", "Convert a PDF first.")
            return
        path = filedialog.asksaveasfilename(
            title="Save pin table",
            defaultextension=".tsv",
            filetypes=[("TSV files", "*.tsv"), ("Text files", "*.txt"), ("All files", "*.*")],
        )
        if not path:
            return
        Path(path).write_text(text, encoding="utf-8")
        self.set_status(f"Saved to {Path(path).name}")


PANEL_CLASS = PdfToPinsPanel  # discovered by gui.registry
