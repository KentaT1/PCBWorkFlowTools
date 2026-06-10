/**
 * Minimal ASCII DXF (R12) writer for closed board outlines.
 */

function num(n) {
  return Number(n).toFixed(4);
}

/**
 * @param {{x:number,y:number}[]} points Closed polygon in mm (CAD coords).
 * @param {{ layer?: string, name?: string }} [options]
 */
export function outlineToDxf(points, options = {}) {
  const layer = options.layer ?? "OUTLINE";
  const name = options.name ?? "BOARD_OUTLINE";
  if (points.length < 3) {
    throw new Error("Outline needs at least 3 points.");
  }

  const lines = [];
  const push = (...parts) => lines.push(...parts);

  push("0", "SECTION", "2", "HEADER");
  push("9", "$ACADVER", "1", "AC1009");
  push("9", "$INSUNITS", "70", "4");
  push("0", "ENDSEC");

  push("0", "SECTION", "2", "TABLES");
  push("0", "TABLE", "2", "LAYER", "70", "1");
  push("0", "LAYER", "2", layer, "70", "0", "62", "7", "6", "CONTINUOUS");
  push("0", "ENDTAB", "0", "ENDSEC");

  push("0", "SECTION", "2", "ENTITIES");
  push("0", "LWPOLYLINE", "8", layer, "90", String(points.length), "70", "1");
  for (const p of points) {
    push("10", num(p.x), "20", num(p.y));
  }
  push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
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
