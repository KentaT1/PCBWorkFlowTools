/**
 * Pin table PDF → Altium Symbol Wizard columns (client-side port).
 */

const NAME_X_MAX = 120;
const NUM_X_MIN = 95;
const NUM_X_MAX = 175;
const TYPE_X_MIN = 185;
const TYPE_X_MAX = 232;
const FUNC_X_MIN = 233;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_+\-]*$/;
const NUM_LIST_RE = /^[\d\s,\-]+$/;
const FUNC_TOKEN_RE = /^[A-Z][A-Z0-9_+.\-]*$/;

/** Standalone GPIO labels reliably use the default (medium) font in Espressif PDFs. */
const GPIO_DEFAULT_TOKEN = /^GPIO\d+$/;

function spanIsDefaultFromStyle(fontName, style) {
  const name = (fontName || "") + (style?.fontFamily || "");
  if (/Medium|Bold|Semibold/i.test(name)) return true;
  if (style?.fontWeight && style.fontWeight >= 600) return true;
  return false;
}

/**
 * PDF.js uses internal font ids (g_d0_f1, g_d0_f3), not family names.
 * Learn default font ids only from single-token text runs (one font = one token).
 */
function calibrateDefaultFonts(items) {
  const defaultFonts = new Set();

  for (const item of items) {
    if (item.x < FUNC_X_MIN) continue;
    const trimmed = item.text.trim();
    // Skip continuation fragments like ", GPIO42" (wrong font for calibration)
    if (trimmed.startsWith(",")) continue;
    const parts = splitCommaParts(trimmed)
      .map((p) => p.trim().replace(/,$/, "").trim())
      .filter(Boolean);
    if (parts.length !== 1) continue;
    if (GPIO_DEFAULT_TOKEN.test(parts[0])) {
      defaultFonts.add(item.fontName);
    }
  }

  return defaultFonts;
}

function itemIsDefault(item, defaultFonts, style) {
  if (defaultFonts.size > 0) {
    return defaultFonts.has(item.fontName);
  }
  return spanIsDefaultFromStyle(item.fontName, style);
}

function splitCommaParts(text) {
  return text.split(/,\s*/);
}

function looksLikeFunctionSpan(span) {
  let sawToken = false;
  for (const part of splitCommaParts(span.text)) {
    const token = part.trim().replace(/,$/, "").trim();
    if (!token) continue;
    sawToken = true;
    if (!FUNC_TOKEN_RE.test(token)) return false;
  }
  return sawToken;
}

function classifySpans(spans) {
  let name = "";
  let numbers = "";
  let pinType = "";
  const functions = [];

  for (const sp of spans) {
    const text = sp.text.trim();
    if (!text) continue;
    if (sp.x <= NAME_X_MAX && !name && NAME_RE.test(text) && !NUM_LIST_RE.test(text)) {
      name = text;
    } else if (NUM_X_MIN <= sp.x && sp.x <= NUM_X_MAX && !numbers && NUM_LIST_RE.test(text)) {
      numbers = text;
    } else if (TYPE_X_MIN <= sp.x && sp.x <= TYPE_X_MAX && !pinType && text.length <= 8) {
      pinType = text;
    } else if (sp.x >= FUNC_X_MIN) {
      functions.push(sp);
    }
  }
  return { name, numbers, pinType, functions };
}

function isTableHeader(spans) {
  const joined = spans.map((s) => s.text).join(" ");
  return joined.includes("Name") && joined.includes("Function");
}

/** Wrapped function text (no pin name/number on this PDF line). */
function isFunctionOnlyLine(spans) {
  const { name, numbers, functions } = classifySpans(spans);
  return !(name && numbers) && functions.some(looksLikeFunctionSpan);
}

function isAnchorLine(spans) {
  const { name, numbers } = classifySpans(spans);
  return Boolean(name && numbers);
}

function attachFunctionSpans(row, extra) {
  for (const s of extra) {
    if (looksLikeFunctionSpan(s)) row.functionSpans.push(s);
  }
}

const WRAP_Y_DISTANCE = 22;

function mergeLinesToRows(lines) {
  const filtered = lines.filter(([, , spans]) => !isTableHeader(spans));
  const funcLines = [];
  const anchors = [];
  let pendingName = null;

  for (const [y, page, spans] of filtered) {
    let { name, numbers, pinType, functions } = classifySpans(spans);
    if (numbers && pendingName && !name) {
      name = pendingName.name;
      pendingName = null;
    }
    if (isAnchorLine(spans) || (name && numbers)) {
      if (pendingName && !name) {
        name = pendingName.name;
        pendingName = null;
      }
      anchors.push({
        y,
        page,
        name,
        numbers,
        pinType,
        functionSpans: functions.filter(looksLikeFunctionSpan),
      });
    } else if (isFunctionOnlyLine(spans)) {
      funcLines.push({ y, page, spans });
    } else if (name && !numbers) {
      pendingName = {
        name: name.replace(/b$/, ""),
        numbers: "",
        pinType: "",
        functionSpans: functions.filter(looksLikeFunctionSpan),
        yAnchor: y,
        page,
      };
    }
  }

  const assigned = new Array(funcLines.length).fill(-1);
  for (let fi = 0; fi < funcLines.length; fi++) {
    const fl = funcLines[fi];
    let best = -1;
    let bestDist = WRAP_Y_DISTANCE + 1;
    for (let ai = 0; ai < anchors.length; ai++) {
      const a = anchors[ai];
      if (fl.page !== a.page) continue;
      const dist = Math.abs(fl.y - a.y);
      if (dist <= WRAP_Y_DISTANCE && dist < bestDist) {
        bestDist = dist;
        best = ai;
      }
    }
    assigned[fi] = best;
  }

  const rows = [];
  for (let ai = 0; ai < anchors.length; ai++) {
    const anchor = anchors[ai];
    const row = {
      name: anchor.name,
      numbers: anchor.numbers,
      pinType: anchor.pinType,
      functionSpans: [...anchor.functionSpans],
      yAnchor: anchor.y,
      page: anchor.page,
    };
    const nearby = funcLines
      .filter((_, fi) => assigned[fi] === ai)
      .sort((a, b) => b.y - a.y);
    for (const fl of nearby) {
      attachFunctionSpans(row, classifySpans(fl.spans).functions);
    }
    rows.push(row);
  }
  return rows;
}

function tokenizeFunctions(spans) {
  const defaults = [];
  const others = [];
  const seen = new Set();

  function addToken(token, isDefault) {
    token = token.trim().replace(/,$/, "").trim();
    if (!token || seen.has(token)) return;
    seen.add(token);
    (isDefault ? defaults : others).push(token);
  }

  for (const sp of spans) {
    for (const part of splitCommaParts(sp.text)) {
      const t = part.trim();
      if (t) addToken(t, sp.isDefault);
    }
  }
  return [...defaults, ...others];
}

function formatDisplayName(row) {
  if (!row.functionSpans.length) return row.name;
  const tokens = tokenizeFunctions(row.functionSpans);
  const valid = tokens.filter((t) => FUNC_TOKEN_RE.test(t));
  if (valid.length) return valid.join("/");
  return row.name;
}

function expandPinNumbers(numbers) {
  const pins = [];
  for (const part of numbers.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes("-")) {
      const [startS, endS] = p.split("-", 2);
      const start = parseInt(startS.trim(), 10);
      const end = parseInt(endS.trim(), 10);
      for (let n = start; n <= end; n++) pins.push(n);
    } else {
      pins.push(parseInt(p, 10));
    }
  }
  return pins;
}

function altiumElectricalType(pinType) {
  const t = pinType.toUpperCase().replace(/\s/g, "");
  if (t === "P") return "Power";
  if (t === "I") return "Input";
  if (t.includes("I/O") || t === "I/O/T") return "HiZ";
  if (t === "O") return "Output";
  return "Passive";
}

function rowsToOutputPins(rows) {
  const output = [];
  for (const row of rows) {
    if (!row.numbers) continue;
    const display = formatDisplayName(row);
    const etype = altiumElectricalType(row.pinType);
    for (const num of expandPinNumbers(row.numbers)) {
      output.push({
        designator: num,
        displayName: display,
        electricalType: etype,
        pinName: row.name,
      });
    }
  }
  output.sort((a, b) => a.designator - b.designator);
  return output;
}

/**
 * Extract positioned text lines from a PDF.js document.
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 */
async function extractLinesFromPdf(pdf, yTolerance = 2) {
  const items = [];

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const styles = textContent.styles || {};

    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        x: item.transform[4],
        y: item.transform[5],
        page: pageIndex,
        text: item.str,
        fontName: item.fontName,
        style: styles[item.fontName] || {},
      });
    }
  }

  const defaultFonts = calibrateDefaultFonts(items);
  for (const item of items) {
    item.isDefault = itemIsDefault(item, defaultFonts, item.style);
  }

  // PDF y-axis points up; sort top-to-bottom for table row order
  items.sort((a, b) => a.page - b.page || a.y - b.y);

  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= yTolerance) {
      last.spans.push(item);
    } else {
      lines.push({ y: item.y, page: item.page, spans: [item] });
    }
  }

  const merged = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && last.page === line.page && Math.abs(last.y - line.y) <= yTolerance) {
      last.spans.push(...line.spans);
    } else {
      merged.push({ y: line.y, page: line.page, spans: [...line.spans] });
    }
  }

  return merged.map((line) => [
    line.y,
    line.page,
    line.spans
      .sort((a, b) => a.x - b.x)
      .map((s) => ({ x: s.x, text: s.text, isDefault: s.isDefault })),
  ]);
}

async function loadPdfJs() {
  if (typeof globalThis.document !== "undefined") {
    const pdfjsLib = await import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
    return pdfjsLib;
  }
  const { pathToFileURL } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const build = join(root, "node_modules", "pdfjs-dist", "build");
  const pdfjsLib = await import(pathToFileURL(join(build, "pdf.mjs")).href);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(build, "pdf.worker.mjs")
  ).href;
  return pdfjsLib;
}

/**
 * @param {ArrayBuffer} pdfData
 * @returns {Promise<{designator:number, displayName:string, electricalType:string, pinName:string}[]>}
 */
export async function convertPdfBuffer(pdfData) {
  const pdfjsLib = await loadPdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const lines = await extractLinesFromPdf(pdf);
  const rows = mergeLinesToRows(lines);
  return rowsToOutputPins(rows);
}

/**
 * @param {{designator:number, displayName:string, electricalType:string, pinName:string}[]} pins
 * @param {{ numberGnd?: boolean }} [options]
 */
export function applyDisplayOptions(pins, options = {}) {
  if (!options.numberGnd) return pins;
  return pins.map((p) => {
    if (p.displayName !== "GND") return p;
    const num = String(p.designator).padStart(2, "0");
    return { ...p, displayName: `GND_${num}` };
  });
}

export function pinsToColumns(pins, includePinName = false) {
  const columns = {
    Designator: pins.map((p) => String(p.designator)),
    "Display Name": pins.map((p) => p.displayName),
    "Electrical Type": pins.map((p) => p.electricalType),
  };
  if (includePinName) {
    columns["Pin Name"] = pins.map((p) => p.pinName);
  }
  return columns;
}
