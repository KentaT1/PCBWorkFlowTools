/**
 * STM32 reference-manual pinout tables (Table 16-style).
 * Columns: package pin numbers, pin name, type, alternate functions, …
 */

import { loadPdfLines } from "../pdf-utils.js";

export const STM_PACKAGES = {
  UFQFPN48: { label: "UFQFPN48", xMin: 62, xMax: 84 },
  VFQFPN68: { label: "VFQFPN68", xMin: 84, xMax: 102 },
  WLCSP100: { label: "WLCSP100", xMin: 102, xMax: 125 },
  UFBGA129: { label: "UFBGA129", xMin: 125, xMax: 155 },
};

const COL = {
  ...STM_PACKAGES,
  PIN_NAME: { xMin: 155, xMax: 212 },
  PIN_TYPE: { xMin: 212, xMax: 238 },
  IO: { xMin: 238, xMax: 272 },
  NOTES: { xMin: 272, xMax: 288 },
  ALT: { xMin: 288, xMax: 400 },
  ADD: { xMin: 400, xMax: 520 },
};

const PACKAGE_IDS = Object.keys(STM_PACKAGES);
const WRAP_Y_ABOVE = 38;
const WRAP_Y_BELOW = 18;
const ALT_TOKEN_RE = /^[A-Z][A-Z0-9_().\-]+$/;
const PIN_NAME_RE = /^[A-Za-z][A-Za-z0-9_+\-().]*$/;

function columnForX(x) {
  for (const [name, col] of Object.entries(COL)) {
    if (x >= col.xMin && x < col.xMax) return name;
  }
  return null;
}

function spansInColumn(spans, colName) {
  const col = COL[colName];
  if (!col) return [];
  return spans.filter((s) => s.x >= col.xMin && s.x < col.xMax);
}

function textInColumn(spans, colName) {
  return spansInColumn(spans, colName)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ");
}

function isTableHeader(spans) {
  const joined = spans.map((s) => s.text).join(" ");
  return (
    joined.includes("Pin name") ||
    joined.includes("Pin number") ||
    joined.includes("Table 16") ||
    joined.includes("(continued)") ||
    joined.includes("pin and ball definitions") ||
    (joined.includes("Alternate functions") && joined.includes("UFQFPN"))
  );
}

function isHeaderFragment(text) {
  const t = text.trim();
  if (!t) return true;
  if (/^Table\s+\d+/i.test(t)) return true;
  if (/continued\)?$/i.test(t)) return true;
  if (/^reset\)$/i.test(t)) return true;
  if (/^Pin\s+(name|number|type)/i.test(t)) return true;
  if (PACKAGE_IDS.includes(t)) return true;
  return false;
}

function isPackageLabel(text) {
  return PACKAGE_IDS.includes(text.trim());
}

function packagePinValue(text) {
  const t = text.trim();
  if (!t || t === "-") return null;
  return t;
}

function parseAltTokens(text) {
  if (!text || text === "-") return [];
  const tokens = [];
  const seen = new Set();
  for (const part of text.split(/,\s*/)) {
    let token = part.trim().replace(/,$/, "").trim();
    if (!token || token === "-") continue;
    if (/^\(\d+\)$/.test(token)) continue;
    if (!ALT_TOKEN_RE.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function joinPinNameParts(parts) {
  const cleaned = parts
    .map((p) => (typeof p === "string" ? { text: p, y: 0 } : p))
    .map((p) => ({ text: p.text.trim(), y: p.y }))
    .filter((p) => p.text && !isHeaderFragment(p.text));
  if (!cleaned.length) return "";
  cleaned.sort((a, b) => b.y - a.y);
  let name = cleaned[0].text;
  for (let i = 1; i < cleaned.length; i++) {
    const part = cleaned[i].text;
    if (name.endsWith("-") || part.startsWith("(")) {
      name += part;
    } else if (part.endsWith("-")) {
      name = part + name;
    } else {
      name += part;
    }
  }
  return name.replace(/\s+/g, "");
}

function altiumElectricalType(pinType) {
  const t = pinType.toUpperCase().replace(/\s/g, "");
  if (t === "S") return "Power";
  if (t === "I") return "Input";
  if (t === "O") return "Output";
  if (t === "RST") return "Input";
  if (t.includes("I/O")) return "HiZ";
  if (t === "RF") return "Passive";
  return "Passive";
}

function parseDesignator(raw, packageId) {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw;
}

function compareDesignators(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function classifyLine(spans, packageId) {
  const pkgText = textInColumn(spans, packageId);
  const pinName = textInColumn(spans, "PIN_NAME");
  const pinType = textInColumn(spans, "PIN_TYPE");
  const altText = textInColumn(spans, "ALT");
  const pkgPin = packagePinValue(pkgText);

  return {
    pkgPin,
    pinName,
    pinType,
    altText,
    hasAlt: Boolean(altText && altText !== "-"),
    hasPinName: Boolean(
      pinName &&
        PIN_NAME_RE.test(pinName.replace(/\s/g, "")) &&
        !isHeaderFragment(pinName)
    ),
  };
}


function isValidPackagePin(raw, packageId) {
  const t = raw?.trim();
  if (!t || t === "-") return false;
  if (PACKAGE_IDS.includes(t)) return false;
  if (packageId === "UFQFPN48" || packageId === "VFQFPN68") {
    return /^\d+$/.test(t);
  }
  return /^[A-Za-z]\d+$/.test(t);
}

function isFullTableRow(info) {
  return Boolean(info.pinType && (info.hasPinName || info.hasAlt));
}

function isFootnoteLine(spans) {
  const joined = spans.map((s) => s.text).join(" ");
  return /^\d+\.\s/.test(joined) || joined.startsWith("After reset");
}

function mergeStmRows(lines, packageId) {
  const filtered = lines.filter(
    ([, , spans]) => !isTableHeader(spans) && !isFootnoteLine(spans)
  );

  const byPage = new Map();
  for (const entry of filtered) {
    const [y, page, spans] = entry;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push({ y, page, spans, ...classifyLine(spans, packageId) });
  }

  const rows = [];
  for (const pageLines of byPage.values()) {
    pageLines.sort((a, b) => b.y - a.y);
    let current = null;

    const flushCurrent = () => {
      if (!current) return;
      rows.push(buildOutputRow(current, packageId));
      current = null;
    };

    const attachPendingAbove = (anchorLine, powerPin) => {
      if (powerPin) return;
      for (const candidate of pageLines) {
        if (candidate.y <= anchorLine.y) continue;
        if (candidate.y - anchorLine.y > WRAP_Y_ABOVE) continue;
        if (isValidPackagePin(candidate.pkgPin, packageId)) continue;
        if (isFullTableRow(candidate)) continue;
        if (candidate.hasAlt || candidate.hasPinName) {
          mergeLineIntoRow(current, candidate);
        }
      }
    };

    for (const line of pageLines) {
      if (isValidPackagePin(line.pkgPin, packageId)) {
        flushCurrent();
        const powerPin = line.pinType === "S";
        current = {
          _y: line.y,
          designatorRaw: line.pkgPin,
          pinNameParts: line.pinName ? [{ text: line.pinName, y: line.y }] : [],
          altParts: line.altText && line.altText !== "-" ? [line.altText] : [],
          pinType: line.pinType,
          powerPin,
        };
        attachPendingAbove(line, powerPin);
        continue;
      }

      if (isFullTableRow(line)) {
        continue;
      }

      if (
        current &&
        !current.powerPin &&
        line.y < current._y &&
        current._y - line.y <= WRAP_Y_BELOW
      ) {
        mergeLineIntoRow(current, line);
      }
    }
    flushCurrent();
  }

  rows.sort((a, b) => compareDesignators(a.designator, b.designator));
  return rows;
}

function mergeLineIntoRow(row, line) {
  if (line.pinName) row.pinNameParts.push({ text: line.pinName, y: line.y });
  if (!row.powerPin && line.altText && line.altText !== "-") {
    row.altParts.push(line.altText);
  }
  if (!row.pinType && line.pinType) row.pinType = line.pinType;
}

function buildOutputRow(row, packageId) {
  const pinName = joinPinNameParts(row.pinNameParts);
  const altTokens = parseAltTokens(row.altParts.join(", "));
  return {
    designator: parseDesignator(row.designatorRaw, packageId),
    pinName: pinName || row.designatorRaw,
    pinType: row.pinType,
    functionTokens: altTokens.length ? altTokens : null,
    displayName: altTokens.length ? altTokens.join("/") : pinName || String(row.designatorRaw),
    electricalType: altiumElectricalType(row.pinType),
  };
}

/**
 * Scan PDF lines for STM package column headers.
 * @param {[number, number, object[]][]} lines
 * @returns {string[]}
 */
export function detectStmPackages(lines) {
  const found = new Set();
  for (const [, , spans] of lines) {
    for (const sp of spans) {
      const col = columnForX(sp.x);
      if (!col || !PACKAGE_IDS.includes(col)) continue;
      const label = sp.text.trim();
      if (isPackageLabel(label)) found.add(label);
    }
  }
  return PACKAGE_IDS.filter((id) => found.has(id));
}

/**
 * @param {ArrayBuffer} pdfData
 * @param {{ packageId?: string }} [options]
 */
export async function convertStm32Pdf(pdfData, options = {}) {
  const packageId = options.packageId ?? "VFQFPN68";
  if (!STM_PACKAGES[packageId]) {
    throw new Error(`Unknown STM package: ${packageId}`);
  }

  const { lines } = await loadPdfLines(pdfData);
  const packages = detectStmPackages(lines);
  if (!packages.length) {
    throw new Error(
      "No STM32 pinout table found. Expected Table 16-style columns (UFQFPN48, VFQFPN68, …)."
    );
  }
  if (!packages.includes(packageId)) {
    throw new Error(
      `Package ${packageId} not found in this PDF. Available: ${packages.join(", ")}`
    );
  }

  return mergeStmRows(lines, packageId);
}

/** @param {ArrayBuffer} pdfData */
export async function detectStmPackagesFromPdf(pdfData) {
  const { lines } = await loadPdfLines(pdfData);
  return detectStmPackages(lines);
}

export const stm32Parser = {
  id: "stm32",
  label: "STM32 pinout table",
  convert: convertStm32Pdf,
  detectPackages: detectStmPackagesFromPdf,
  packages: STM_PACKAGES,
};
