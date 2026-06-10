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

for (let p = 1; p <= 2; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((i) => i.str.trim())
    .map((i) => ({
      x: +i.transform[4].toFixed(1),
      y: +i.transform[5].toFixed(1),
      t: i.str.trim(),
    }));

  const header = items.filter((i) =>
    /VFQFPN|UFQFPN|Pin name|Alternate|WLCSP|UFBGA/.test(i.t)
  );
  console.log("Page", p, "header:", header);

  const pa0 = items.find((i) => i.t === "PA0");
  if (pa0) {
    const line = items
      .filter((i) => Math.abs(i.y - pa0.y) <= 2)
      .sort((a, b) => a.x - b.x);
    console.log("PA0 line:", line.map((i) => `${i.x}:${i.t}`).join(" | "));
  }

  // PC14 multi-line name
  const pc14 = items.find((i) => i.t.startsWith("PC14"));
  if (pc14) {
    const nearby = items
      .filter((i) => Math.abs(i.y - pc14.y) <= 15 && i.x > 150)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    console.log("PC14 area:", nearby.slice(0, 15).map((i) => `${i.x},${i.y}:${i.t}`));
  }

  // all x buckets on page 1 data rows
  const xs = new Set();
  for (const i of items) {
    if (i.y < 640 && i.y > 100) xs.add(Math.round(i.x / 5) * 5);
  }
  console.log("X buckets:", [...xs].sort((a, b) => a - b));
}
