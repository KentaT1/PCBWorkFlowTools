import { downloadDxf, exportSizeLabel, outlineToDxf } from "../dxf-writer.js";
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
  const detectionInput = $("#pcb-detection", root);
  const exportUnitsInput = $("#pcb-export-units", root);
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
      if (!Number.isFinite(boardWidth) || boardWidth <= 0) {
        showError("Enter the real board width in mm so the DXF scales correctly.");
        setStatus("Board width required", true);
        return;
      }
      const result = extractOutlineFromCanvas(workingCanvas, {
        threshold: thresholdManual ? Number(thresholdInput.value) : null,
        invert: invertInput.checked,
        simplify: Number(simplifyInput.value),
        boardWidthMm: boardWidth,
        detection: detectionInput?.value ?? "auto",
      });
      lastResult = result;
      if (result.threshold != null) {
        thresholdInput.value = String(result.threshold);
        thresholdVal.textContent = String(result.threshold);
      }

      const maskCanvas = renderMaskPreview(
        result.boardMask,
        result.pixelPath,
        result.width,
        result.height
      );
      showCanvas(maskCanvas, previewMask);

      const units = exportUnitsInput?.value === "mm" ? "mm" : "mils";
      statsEl.hidden = false;
      const modeLabel =
        result.detection === "green"
          ? "green PCB"
          : result.detection === "bright"
            ? "bright"
            : "dark";
      statsEl.textContent = `${result.pointCount} vertices · ${exportSizeLabel(result.mmPath, units)} · detected via ${modeLabel} · DXF: 1 unit = 1 ${units === "mils" ? "mil" : "mm"}`;
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
    const units = exportUnitsInput?.value === "mm" ? "mm" : "mils";
    const dxf = outlineToDxf(lastResult.mmPath, { units });
    downloadDxf(dxf, `${sourceName}-outline-${units}.dxf`);
    const unitLabel = units === "mils" ? "mil" : "mm";
    setStatus(
      `DXF downloaded (${units}). In Altium: File → Import → DXF/DWG, Model space, 1 AutoCAD unit = 1 ${unitLabel}.`
    );
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
  boardWidthInput.addEventListener("input", () => {
    if (workingCanvas && lastResult) runExtract();
  });
  detectionInput?.addEventListener("change", () => {
    if (workingCanvas) runExtract();
  });
  exportUnitsInput?.addEventListener("change", () => {
    if (lastResult?.mmPath?.length) {
      const units = exportUnitsInput.value === "mm" ? "mm" : "mils";
      statsEl.textContent = `${lastResult.pointCount} vertices · ${exportSizeLabel(lastResult.mmPath, units)} · DXF export: 1 unit = 1 ${units === "mils" ? "mil" : "mm"}`;
    }
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) onFileSelected(file);
  });
}
