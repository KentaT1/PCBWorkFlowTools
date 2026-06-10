import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const build = join(__dirname, "..", "node_modules", "pdfjs-dist", "build");
const pdfjs = await import(pathToFileURL(join(build, "pdf.mjs")).href);

const data = new Uint8Array(
  readFileSync("c:/Users/bepow/Downloads/4ccc4359-a6e6-4ee4-ad96-aabc8bca36ef.pdf")
);
const pdf = await pdfjs.getDocument({ data }).promise;

// Re-import parser module fresh
const parserUrl = pathToFileURL(
  join(__dirname, "..", "docs", "js", "parser.js")
).href;
const mod = await import(parserUrl + "?t=" + Date.now());

const pins = await mod.convertPdfBuffer(
  data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
);
console.log("pin5", pins.find((p) => p.designator === 5)?.displayName);
