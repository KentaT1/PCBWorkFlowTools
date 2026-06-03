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

function spanIsDefault(fontName, style) {
  const name = (fontName || "") + (style?.fontFamily || "");
  if (/Medium|Bold|Semibold/i.test(name)) return true;
  if (style?.fontWeight && style.fontWeight >= 600) return true;
  return false;
}

function splitCommaParts(text) {
  return text.split(/,\s*/);
}

function looksLikeFunctionSpan(span) {
  for (const part of splitCommaParts(span.text)) {
    const token = part.trim().replace(/,$/, "").trim();
    if (!token) continue;
    if (!FUNC_TOKEN_RE.test(token)) return false;
  }
  return true;
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

function isContinuationLine(spans) {
  const { name, numbers, pinType, functions } = classifySpans(spans);
  return !name && !numbers && !pinType && functions.length > 0;
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

function rowNeedsMoreFunctions(row) {
  if (!row.functionSpans.length) return true;
  const last = row.functionSpans[row.functionSpans.length - 1].text.trimEnd();
  return last.endsWith(",");
}

function mergeLinesToRows(lines) {
  const filtered = lines.filter(([, , spans]) => !isTableHeader(spans));
  const rows = [];
  const pendingFuncs = [];
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
      const row = {
        name,
        numbers,
        pinType,
        functionSpans: functions.filter(looksLikeFunctionSpan),
        yAnchor: y,
        page,
      };
      for (const [fy, fpage, fspans] of pendingFuncs) {
        if (fpage === page && fy < y && y - fy <= 20) {
          attachFunctionSpans(row, classifySpans(fspans).functions);
        }
      }
      pendingFuncs.length = 0;
      rows.push(row);
    } else if (isContinuationLine(spans)) {
      let extra = classifySpans(spans).functions.filter(looksLikeFunctionSpan);
      if (rows.length && extra.length) {
        const last = rows[rows.length - 1];
        if (page === last.page && y > last.yAnchor && y - last.yAnchor <= 20 && rowNeedsMoreFunctions(last)) {
          attachFunctionSpans(last, extra);
          continue;
        }
      }
      pendingFuncs.push([y, page, spans]);
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
  if (row.functionSpans.length) {
    const tokens = tokenizeFunctions(row.functionSpans);
    if (tokens.length && tokens.every((t) => FUNC_TOKEN_RE.test(t))) {
      return tokens.join("/");
    }
  }
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
      const style = styles[item.fontName] || {};
      items.push({
        x: item.transform[4],
        y: item.transform[5],
        page: pageIndex,
        text: item.str,
        isDefault: spanIsDefault(item.fontName, style),
      });
    }
  }

  items.sort((a, b) => a.page - b.page || b.y - a.y);

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

/**
 * @param {ArrayBuffer} pdfData
 * @returns {Promise<{designator:number, displayName:string, electricalType:string, pinName:string}[]>}
 */
export async function convertPdfBuffer(pdfData) {
  const pdfjsLib = await import(
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs"
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  const lines = await extractLinesFromPdf(pdf);
  const rows = mergeLinesToRows(lines);
  return rowsToOutputPins(rows);
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
