import { downloadDxf, outlineToDxf } from "../dxf-writer.js";
import {
  extractOutlineFromCanvas,
  imageToWorkingCanvas,
  renderMaskPreview,
} from "../pcb-to-dxf.js";

const $ = (sel, root = document) => root.querySelector(sel);

export function initPcbDxfTool(root) {
  const fileInput = $("#pcb-image-file", root);
  const thresholdInput = $("#pcb-threshold", root);
  const thresholdVal = $("#pcb-threshold-val", root);
  const invertInput = $("#pcb-invert", root);
  const simplifyInput = $("#pcb-simplify", root);
  const simplifyVal = $("#pcb-simplify-val", root);
  const boardWidthInput = $("#pcb-board-width", root);
  const convertBtn = $("#pcb-convert-btn", root);
  const downloadBtn = $("#pcb-download-dxf", root);
  const statusEl = $("#pcb-status", root);
  const errorEl = $("#pcb-error", root);
  const previewOriginal = $("#pcb-preview-original", root);
  const previewMask = $("#pcb-preview-mask", root);
  const statsEl = $("#pcb-stats", root);

  let workingCanvas = null;
  let lastResult = null;
  let sourceName = "board";
  let thresholdManual = false;

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", isError);
  }

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function showCanvas(canvas, imgEl) {
    imgEl.src = canvas.toDataURL("image/png");
    imgEl.hidden = false;
  }

  function runExtract() {
    if (!workingCanvas) return;
    showError("");
    try {
      const boardWidth = parseFloat(boardWidthInput.value);
      const result = extractOutlineFromCanvas(workingCanvas, {
        threshold: thresholdManual ? Number(thresholdInput.value) : null,
        invert: invertInput.checked,
        simplify: Number(simplifyInput.value),
        boardWidthMm: Number.isFinite(boardWidth) && boardWidth > 0 ? boardWidth : null,
      });
      lastResult = result;
      thresholdInput.value = String(result.threshold);
      thresholdVal.textContent = String(result.threshold);

      const maskCanvas = renderMaskPreview(
        result.boardMask,
        result.pixelPath,
        result.width,
        result.height
      );
      showCanvas(maskCanvas, previewMask);

      statsEl.hidden = false;
      statsEl.textContent = `${result.pointCount} vertices · ${result.boardWidthMm.toFixed(2)} × ${result.boardHeightMm.toFixed(2)} mm · scale ${result.mmPerPx.toFixed(4)} mm/px`;
      downloadBtn.hidden = false;
      setStatus("Outline ready — download DXF or tweak settings and Convert again.");
    } catch (err) {
      console.error(err);
      lastResult = null;
      downloadBtn.hidden = true;
      statsEl.hidden = true;
      showError(err.message || String(err));
      setStatus("Extraction failed", true);
    }
  }

  async function onFileSelected(file) {
    showError("");
    downloadBtn.hidden = true;
    statsEl.hidden = true;
    lastResult = null;
    thresholdManual = false;
    sourceName = file.name.replace(/\.[^.]+$/, "") || "board";

    setStatus("Loading image…");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const { canvas } = imageToWorkingCanvas(img);
      workingCanvas = canvas;
      showCanvas(canvas, previewOriginal);
      previewMask.hidden = true;
      setStatus(`Loaded ${file.name} — click Convert outline.`);
    } catch (err) {
      showError("Could not load image.");
      setStatus("Load failed", true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  convertBtn.addEventListener("click", () => {
    if (!workingCanvas) {
      showError("Choose a PCB image first.");
      return;
    }
    convertBtn.disabled = true;
    setStatus("Tracing outline…");
    requestAnimationFrame(() => {
      runExtract();
      convertBtn.disabled = false;
    });
  });

  downloadBtn.addEventListener("click", () => {
    if (!lastResult?.mmPath?.length) return;
    const dxf = outlineToDxf(lastResult.mmPath, { name: sourceName });
    downloadDxf(dxf, `${sourceName}-outline.dxf`);
    setStatus("DXF downloaded.");
  });

  thresholdInput.addEventListener("input", () => {
    thresholdManual = true;
    thresholdVal.textContent = thresholdInput.value;
    if (workingCanvas && lastResult) runExtract();
  });
  simplifyInput.addEventListener("input", () => {
    simplifyVal.textContent = simplifyInput.value;
    if (workingCanvas && lastResult) runExtract();
  });
  invertInput.addEventListener("change", () => {
    if (workingCanvas) runExtract();
  });
  boardWidthInput.addEventListener("change", () => {
    if (workingCanvas && lastResult) runExtract();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) onFileSelected(file);
  });
}
