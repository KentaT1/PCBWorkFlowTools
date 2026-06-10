import { readFileSync } from "fs";
import { loadPdfLines } from "../docs/js/pdf-utils.js";

const path = process.argv[2];
const buf = readFileSync(path);
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const { lines } = await loadPdfLines(data);

for (const [y, page, spans] of lines) {
  if (page !== 0 || y < 410 || y > 520) continue;
  const sorted = spans.sort((a, b) => a.x - b.x);
  const vfq = sorted.filter((s) => s.x >= 84 && s.x < 102).map((s) => s.text).join("");
  const alt = sorted.filter((s) => s.x >= 288).map((s) => s.text).join("");
  console.log(`y=${y.toFixed(1)} vfq=${vfq} alt=${alt.slice(0, 40)}`);
}
