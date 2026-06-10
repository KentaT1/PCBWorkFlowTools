import { createCanvas, loadImage } from "@napi-rs/canvas";
import { extractOutlineFromCanvas } from "../docs/js/pcb-to-dxf.js";

globalThis.document = { createElement: () => createCanvas(1, 1) };

const path = process.argv[2];
const boardWidthMm = parseFloat(process.argv[3] || "56");
const img = await loadImage(path);
const w = Math.round(img.width * Math.min(1, 1600 / Math.max(img.width, img.height)));
const h = Math.round(img.height * Math.min(1, 1600 / Math.max(img.width, img.height)));
const canvas = createCanvas(w, h);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0, w, h);

for (const detection of ["auto", "green", "dark", "bright"]) {
  try {
    const r = extractOutlineFromCanvas(canvas, { boardWidthMm, detection });
    console.log(
      `${detection}: OK mode=${r.detection} pts=${r.pointCount} ${r.boardWidthMm.toFixed(1)}x${r.boardHeightMm.toFixed(1)}mm`
    );
  } catch (e) {
    console.log(`${detection}: FAIL ${e.message}`);
  }
}
