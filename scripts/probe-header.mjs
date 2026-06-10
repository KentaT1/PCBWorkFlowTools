import { readFileSync } from "fs";
import { loadPdfLines } from "../docs/js/pdf-utils.js";

const path = process.argv[2];
const buf = readFileSync(path);
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const { lines } = await loadPdfLines(data);

for (const [y, page, spans] of lines) {
  if (page !== 1) continue;
  const vfq = spans.filter((s) => s.x >= 84 && s.x < 102).map((s) => s.text).join("");
  if (vfq === "7" || /Table|continued|reset/.test(spans.map((s) => s.text).join(""))) {
    console.log(`p2 y=${y.toFixed(1)}`, spans.sort((a,b)=>a.x-b.x).map(s=>`${s.x.toFixed(0)}:${s.text}`).join(" | "));
  }
}
