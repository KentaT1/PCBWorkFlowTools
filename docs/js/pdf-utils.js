/**
 * Shared PDF.js loading and positioned text extraction.
 */

export async function loadPdfJs() {
  if (typeof globalThis.document !== "undefined") {
    const pdfjsLib = await import(
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
    return pdfjsLib;
  }
  const { pathToFileURL } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const build = join(root, "node_modules", "pdfjs-dist", "build");
  const pdfjsLib = await import(pathToFileURL(join(build, "pdf.mjs")).href);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(build, "pdf.worker.mjs")
  ).href;
  return pdfjsLib;
}

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {number} [yTolerance]
 * @returns {Promise<[number, number, {x:number,text:string,isDefault?:boolean}[]][]>}
 */
export async function extractLinesFromPdf(pdf, yTolerance = 2) {
  const items = [];

  for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const styles = textContent.styles || {};

    for (const item of textContent.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({
        x: item.transform[4],
        y: item.transform[5],
        page: pageIndex,
        text: item.str,
        fontName: item.fontName,
        style: styles[item.fontName] || {},
      });
    }
  }

  items.sort((a, b) => a.page - b.page || a.y - b.y);

  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last && last.page === item.page && Math.abs(last.y - item.y) <= yTolerance) {
      last.spans.push(item);
    } else {
      lines.push({ y: item.y, page: item.page, spans: [item] });
    }
  }

  const merged = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    if (last && last.page === line.page && Math.abs(last.y - line.y) <= yTolerance) {
      last.spans.push(...line.spans);
    } else {
      merged.push({ y: line.y, page: line.page, spans: [...line.spans] });
    }
  }

  return merged.map((line) => [
    line.y,
    line.page,
    line.spans
      .sort((a, b) => a.x - b.x)
      .map((s) => ({
        x: s.x,
        text: s.text,
        isDefault: s.isDefault,
        fontName: s.fontName,
        style: s.style,
      })),
  ]);
}

/**
 * @param {ArrayBuffer} pdfData
 */
export async function loadPdfLines(pdfData) {
  const pdfjsLib = await loadPdfJs();
  const bytes =
    pdfData instanceof Uint8Array ? pdfData : new Uint8Array(pdfData);
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const lines = await extractLinesFromPdf(pdf);
  return { pdf, lines };
}
