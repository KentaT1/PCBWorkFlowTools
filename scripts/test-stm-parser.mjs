import { readFileSync } from "fs";
import { convertStm32Pdf, detectStmPackagesFromPdf } from "../docs/js/parsers/stm32-pinout.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/test-stm-parser.mjs <pdf>");
  process.exit(1);
}

const buf = readFileSync(path);
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const packages = await detectStmPackagesFromPdf(data);
console.log("packages", packages);

const pins = await convertStm32Pdf(data, { packageId: "VFQFPN68" });
console.log("count", pins.length);

for (const n of [1, 3, 7, 15, 56, 57, 68]) {
  const p = pins.find((x) => x.designator === n);
  console.log(n, p?.pinName, "|", p?.displayName?.slice(0, 90));
}

const missing = pins.filter(
  (p) => !p.pinName || p.pinName === String(p.designator)
);
console.log("weak pin names", missing.length);
for (const p of missing.slice(0, 8)) {
  console.log(" ", p.designator, p.pinName, p.displayName?.slice(0, 40));
}
