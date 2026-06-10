/**
 * DXF writer tuned for Altium Designer import (classic POLYLINE, model space).
 */

export const MILS_PER_MM = 39.37007874015748;

/** @typedef {"mm" | "mils"} DxfUnits */

function num(n) {
  return Number(n).toFixed(6).replace(/\.?0+$/, "") || "0";
}

function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * @param {{x:number,y:number}[]} points in mm
 * @param {DxfUnits} units
 */
export function mmPointsToExportCoords(points, units) {
  const scale = units === "mils" ? MILS_PER_MM : 1;
  return points.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

function dedupePoints(points) {
  if (!points.length) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) out.push(b);
  }
  return out;
}

/**
 * @param {{x:number,y:number}[]} pointsMm Closed polygon in millimeters.
 * @param {{ layer?: string, units?: DxfUnits }} [options]
 */
export function outlineToDxf(pointsMm, options = {}) {
  const layer = options.layer ?? "OUTLINE";
  const units = options.units ?? "mils";
  if (pointsMm.length < 3) {
    throw new Error("Outline needs at least 3 points.");
  }

  const points = dedupePoints(mmPointsToExportCoords(pointsMm, units));
  const bb = bbox(points);
  const lines = [];
  const push = (...parts) => lines.push(...parts);

  // R12-compatible header; coordinates live in model space ENTITIES section.
  push("0", "SECTION", "2", "HEADER");
  push("9", "$ACADVER", "1", "AC1009");
  push("9", "$INSUNITS", "70", units === "mils" ? "1" : "4");
  push("9", "$MEASUREMENT", "70", units === "mils" ? "0" : "1");
  push("9", "$EXTMIN", "10", num(bb.minX), "20", num(bb.minY), "30", "0");
  push("9", "$EXTMAX", "10", num(bb.maxX), "20", num(bb.maxY), "30", "0");
  push("9", "$LIMMIN", "10", num(bb.minX), "20", num(bb.minY));
  push("9", "$LIMMAX", "10", num(bb.maxX), "20", num(bb.maxY));
  push("0", "ENDSEC");

  push("0", "SECTION", "2", "TABLES");
  push("0", "TABLE", "2", "LAYER", "70", "1");
  push("0", "LAYER", "2", layer, "70", "0", "62", "7", "6", "CONTINUOUS");
  push("0", "ENDTAB", "0", "ENDSEC");

  push("0", "SECTION", "2", "ENTITIES");
  push("0", "POLYLINE", "8", layer, "66", "1", "70", "1");
  for (const p of points) {
    push("0", "VERTEX", "8", layer, "10", num(p.x), "20", num(p.y));
  }
  push("0", "SEQEND", "8", layer);
  push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

export function exportSizeLabel(pointsMm, units) {
  const wMm = pointsMm.length
    ? Math.max(...pointsMm.map((p) => p.x)) - Math.min(...pointsMm.map((p) => p.x))
    : 0;
  const hMm = pointsMm.length
    ? Math.max(...pointsMm.map((p) => p.y)) - Math.min(...pointsMm.map((p) => p.y))
    : 0;
  if (units === "mils") {
    return `${(wMm * MILS_PER_MM).toFixed(1)} × ${(hMm * MILS_PER_MM).toFixed(1)} mils (${wMm.toFixed(2)} × ${hMm.toFixed(2)} mm)`;
  }
  return `${wMm.toFixed(2)} × ${hMm.toFixed(2)} mm`;
}

/**
 * @param {string} dxf
 * @param {string} filename
 */
export function downloadDxf(dxf, filename = "board-outline.dxf") {
  const blob = new Blob([dxf], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
