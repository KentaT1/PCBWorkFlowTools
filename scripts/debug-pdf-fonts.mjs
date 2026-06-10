import { readFileSync } from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const path =
  process.argv[2] ||
  "c:/Users/bepow/Downloads/4ccc4359-a6e6-4ee4-ad96-aabc8bca36ef.pdf";

const data = new Uint8Array(readFileSync(path));
const pdf = await getDocument({ data }).promise;
const page = await pdf.getPage(1);
const tc = await page.getTextContent();

for (const item of tc.items) {
  if (!item.str?.includes("GPIO") && !item.str?.includes("RTC")) continue;
  const style = tc.styles[item.fontName] || {};
  console.log(JSON.stringify({
    str: item.str.slice(0, 40),
    fontName: item.fontName,
    style,
  }));
}
