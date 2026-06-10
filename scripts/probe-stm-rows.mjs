import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";

const root = join(import.meta.dirname, "..");
const build = join(root, "node_modules", "pdfjs-dist", "build");
const pdfjsLib = await import(pathToFileURL(join(build, "pdf.mjs")).href);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(build, "pdf.worker.mjs")
).href;

const path = process.argv[2];
const data = new Uint8Array(readFileSync(path));
const pdf = await pdfjsLib.getDocument({ data }).promise;

const COL = {
  UFQFPN48: [62, 84],
  VFQFPN68: [84, 102],
  WLCSP100: [102, 125],
  UFBGA129: [125, 155],
  PIN_NAME: [155, 212],
  PIN_TYPE: [212, 238],
  IO: [238, 272],
  NOTES: [272, 288],
  ALT: [288, 400],
  ADD: [400, 520],
};

function col(x) {
  for (const [name, [a, b]] of Object.entries(COL)) {
    if (x >= a && x < b) return name;
  }
  return "?";
}

for (let p = 1; p <= 9; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const byY = new Map();
  for (const item of tc.items) {
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    const t = item.str.trim();
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push({ x, t });
  }
  const ys = [...byY.keys()].sort((a, b) => b - a);
  let vfqCount = 0;
  for (const y of ys) {
    const spans = byY.get(y).sort((a, b) => a.x - b.x);
    const vfq = spans.find((s) => col(s.x) === "VFQFPN68" && /^\d+$/.test(s.t));
    if (vfq) {
      vfqCount++;
      if (vfqCount <= 3 || vfq.t === "15" || vfq.t === "3") {
        console.log(`p${p} y${y} #${vfq.t}:`, spans.map((s) => `${col(s.x)}:${s.t}`).join(" | "));
      }
    }
  }
  console.log(`page ${p}: ${vfqCount} VFQFPN68 anchors`);
}
