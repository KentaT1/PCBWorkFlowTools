#!/usr/bin/env python3
"""
Extract pin tables from datasheet PDFs and format them for Altium Symbol Wizard.

Output is tab-separated text suitable for Smart Paste:
  Designator, Display Name, Electrical Type

Display names list default (bold/medium) pin functions first, then alternates
separated by "/" instead of commas. Pin numbers like "46-65" expand to one row
per physical pin.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import fitz

# Column x thresholds (Espressif-style tables; tuned from header layout)
NAME_X_MAX = 120
NUM_X_MIN = 95
NUM_X_MAX = 175
TYPE_X_MIN = 185
TYPE_X_MAX = 232
FUNC_X_MIN = 233

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_+\-]*$")
NUM_LIST_RE = re.compile(r"^[\d\s,\-]+$")
FUNC_TOKEN_RE = re.compile(r"^[A-Z][A-Z0-9_+.\-]*$")


@dataclass
class Span:
    x: float
    text: str
    is_default: bool


@dataclass
class PinRow:
    name: str
    numbers: str
    pin_type: str
    function_spans: list[Span] = field(default_factory=list)
    y_anchor: float = 0.0
    page: int = 0


def span_is_default(span: dict) -> bool:
    font = span.get("font", "")
    if "Medium" in font or "Bold" in font or "Semibold" in font:
        return True
    if span.get("flags", 0) & 16:
        return True
    return False


def extract_lines(pdf_path: Path, y_tolerance: float = 2.0) -> list[tuple[float, int, list[Span]]]:
    """Return (y, page, spans) grouped by table row (merged lines at the same y)."""
    raw: list[tuple[float, int, list[Span]]] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            for block in page.get_text("dict")["blocks"]:
                if block.get("type") != 0:
                    continue
                for line in block["lines"]:
                    y = line["bbox"][1]
                    spans = [
                        Span(s["bbox"][0], s["text"], span_is_default(s))
                        for s in line["spans"]
                        if s["text"].strip()
                    ]
                    if spans:
                        raw.append((y, page_index, spans))
    finally:
        doc.close()

    # PDF tables often emit one fitz "line" per cell; merge by y on each page.
    raw.sort(key=lambda item: (item[1], item[0]))
    merged: list[tuple[float, int, list[Span]]] = []
    for y, page, spans in raw:
        if merged and merged[-1][1] == page and abs(merged[-1][0] - y) <= y_tolerance:
            merged[-1][2].extend(spans)
        else:
            merged.append((y, page, spans))
    for i, (y, page, spans) in enumerate(merged):
        merged[i] = (y, page, sorted(spans, key=lambda s: s.x))
    return merged


def classify_spans(spans: list[Span]) -> tuple[str, str, str, list[Span]]:
    name = ""
    numbers = ""
    pin_type = ""
    functions: list[Span] = []

    for sp in spans:
        x = sp.x
        text = sp.text.strip()
        if not text:
            continue
        if x <= NAME_X_MAX and not name and NAME_RE.match(text) and not NUM_LIST_RE.match(text):
            name = text
        elif NUM_X_MIN <= x <= NUM_X_MAX and not numbers and NUM_LIST_RE.match(text):
            numbers = text
        elif TYPE_X_MIN <= x <= TYPE_X_MAX and not pin_type and len(text) <= 8:
            pin_type = text
        elif x >= FUNC_X_MIN:
            functions.append(sp)

    return name, numbers, pin_type, functions


def looks_like_function_span(span: Span) -> bool:
    """True if span text looks like comma-separated signal names, not prose."""
    for part in re.split(r",\s*", span.text):
        token = part.strip().rstrip(",").strip()
        if not token:
            continue
        if not FUNC_TOKEN_RE.match(token):
            return False
    return True


def is_table_header(spans: list[Span]) -> bool:
    joined = " ".join(s.text for s in spans)
    return "Name" in joined and "Function" in joined


def is_continuation_line(spans: list[Span]) -> bool:
    name, numbers, pin_type, functions = classify_spans(spans)
    return not name and not numbers and not pin_type and bool(functions)


def is_anchor_line(spans: list[Span]) -> bool:
    name, numbers, _, _ = classify_spans(spans)
    return bool(name and numbers)


def _attach_function_spans(row: PinRow, extra: list[Span]) -> None:
    row.function_spans.extend(s for s in extra if looks_like_function_span(s))


def merge_lines_to_rows(lines: list[tuple[float, int, list[Span]]]) -> list[PinRow]:
    """Group PDF lines into logical pin table rows."""
    filtered = [
        (y, page, spans)
        for y, page, spans in lines
        if not is_table_header(spans)
    ]

    func_lines: list[tuple[float, int, list[Span]]] = []
    anchors: list[tuple[float, int, str, str, str, list[Span]]] = []
    pending_name: PinRow | None = None

    for y, page, spans in filtered:
        name, numbers, pin_type, functions = classify_spans(spans)
        if numbers and pending_name and not name:
            name = pending_name.name
            pending_name = None
        if is_anchor_line(spans) or (name and numbers):
            if pending_name and not name:
                name = pending_name.name
                pending_name = None
            anchors.append(
                (
                    y,
                    page,
                    name,
                    numbers,
                    pin_type,
                    [s for s in functions if looks_like_function_span(s)],
                )
            )
        elif is_continuation_line(spans):
            func_lines.append((y, page, spans))
        elif name and not numbers:
            pending_name = PinRow(
                name=name.rstrip("b"),
                numbers="",
                pin_type="",
                function_spans=[s for s in functions if looks_like_function_span(s)],
                y_anchor=y,
                page=page,
            )

    rows: list[PinRow] = []
    for y, page, name, numbers, pin_type, anchor_funcs in anchors:
        row = PinRow(
            name=name,
            numbers=numbers,
            pin_type=pin_type,
            function_spans=list(anchor_funcs),
            y_anchor=y,
            page=page,
        )
        for fy, fpage, fspans in sorted(
            (fl for fl in func_lines if fl[1] == page and abs(fl[0] - y) <= 20),
            key=lambda fl: fl[0],
            reverse=True,
        ):
            _, _, _, extra = classify_spans(fspans)
            _attach_function_spans(row, extra)
        rows.append(row)

    return rows


def tokenize_functions(spans: list[Span]) -> list[str]:
    """Build ordered function list: defaults first, then alternates."""
    defaults: list[str] = []
    others: list[str] = []
    seen: set[str] = set()

    def add_token(token: str, is_default: bool) -> None:
        token = token.strip().rstrip(",").strip()
        if not token or token in seen:
            return
        seen.add(token)
        if is_default:
            defaults.append(token)
        else:
            others.append(token)

    for sp in spans:
        # Entire span shares one weight (PDF font run)
        parts = re.split(r",\s*", sp.text)
        for part in parts:
            part = part.strip()
            if not part:
                continue
            add_token(part, sp.is_default)

    return defaults + others


def format_display_name(row: PinRow) -> str:
    if row.function_spans:
        tokens = tokenize_functions(row.function_spans)
        if tokens and all(FUNC_TOKEN_RE.match(t) for t in tokens):
            return "/".join(tokens)
    return row.name


def expand_pin_numbers(numbers: str) -> list[int]:
    pins: list[int] = []
    for part in numbers.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start, end = int(start_s.strip()), int(end_s.strip())
            pins.extend(range(start, end + 1))
        else:
            pins.append(int(part))
    return pins


def altium_electrical_type(pin_type: str) -> str:
    t = pin_type.upper().replace(" ", "")
    if t == "P":
        return "Power"
    if t == "I":
        return "Input"
    if "I/O" in t or t == "I/O/T":
        return "HiZ"
    if t == "O":
        return "Output"
    return "Passive"


@dataclass
class OutputPin:
    designator: int
    display_name: str
    electrical_type: str
    pin_name: str


def rows_to_output_pins(rows: list[PinRow]) -> list[OutputPin]:
    output: list[OutputPin] = []
    for row in rows:
        if not row.numbers:
            continue
        display = format_display_name(row)
        etype = altium_electrical_type(row.pin_type)
        for num in expand_pin_numbers(row.numbers):
            output.append(
                OutputPin(
                    designator=num,
                    display_name=display,
                    electrical_type=etype,
                    pin_name=row.name,
                )
            )
    output.sort(key=lambda p: p.designator)
    return output


def convert_pdf(pdf_path: Path) -> list[OutputPin]:
    lines = extract_lines(pdf_path)
    rows = merge_lines_to_rows(lines)
    return rows_to_output_pins(rows)


def format_tsv(pins: list[OutputPin], include_pin_name: bool = False) -> str:
    if include_pin_name:
        header = "Designator\tDisplay Name\tElectrical Type\tPin Name"
        body = [
            f"{p.designator}\t{p.display_name}\t{p.electrical_type}\t{p.pin_name}"
            for p in pins
        ]
    else:
        header = "Designator\tDisplay Name\tElectrical Type"
        body = [
            f"{p.designator}\t{p.display_name}\t{p.electrical_type}" for p in pins
        ]
    return "\n".join([header, *body])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert a datasheet pin-definition PDF to Altium Symbol Wizard TSV."
    )
    parser.add_argument("pdf", type=Path, help="Input PDF path")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write TSV to this file (default: stdout)",
    )
    parser.add_argument(
        "--pin-name-column",
        action="store_true",
        help="Add a Pin Name column (signal name from the Name column)",
    )
    args = parser.parse_args(argv)

    if not args.pdf.is_file():
        print(f"Error: file not found: {args.pdf}", file=sys.stderr)
        return 1

    pins = convert_pdf(args.pdf)
    if not pins:
        print("Error: no pin rows found in PDF.", file=sys.stderr)
        return 1

    text = format_tsv(pins, include_pin_name=args.pin_name_column)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
        print(f"Wrote {len(pins)} pins to {args.output}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
