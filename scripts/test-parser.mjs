import { readFileSync } from "fs";
import { convertPdfBuffer } from "../docs/js/parser.js";

const path = process.argv[2];
const format = process.argv[3] || "espressif";
const packageId = process.argv[4] || "VFQFPN68";

if (!path) {
  console.error("Usage: node scripts/test-parser.mjs <pdf> [espressif|stm32] [packageId]");
  process.exit(1);
}

const buf = readFileSync(path);
const pins = await convertPdfBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  { format, packageId }
);
console.log("count", pins.length);
for (const n of [5, 14, 23, 39]) {
  const p = pins.find((x) => x.designator === n);
  console.log(n, p?.displayName);
}
