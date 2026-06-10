import {
  applyDisplayOptions,
  convertPdfBuffer,
  detectStmPackagesFromPdf,
  pinsToColumns,
  STM_PACKAGES,
} from "../parser.js?v=14";

const $ = (sel, root = document) => root.querySelector(sel);

export function initPinsTool(root) {
  const datasheetFormat = $("#datasheet-format", root);
  const stmPackageRow = $("#stm-package-row", root);
  const stmPackage = $("#stm-package", root);
  const fileInput = $("#pdf-file", root);
  const includePinName = $("#include-pin-name", root);
  const numberGnd = $("#number-gnd", root);
  const functionSeparator = $("#function-separator", root);
  const convertBtn = $("#convert-btn", root);
  const statusEl = $("#pins-status", root);
  const columnsEl = $("#columns", root);
  const emptyEl = $("#empty-state", root);
  const errorEl = $("#pins-error", root);
  const copyTsvBtn = $("#copy-tsv", root);

  let lastPins = [];
  let lastPdfBuffer = null;

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", isError);
  }

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  function isStmFormat() {
    return datasheetFormat?.value === "stm32";
  }

  function updateFormatUi() {
    const stm = isStmFormat();
    stmPackageRow.hidden = !stm;
    numberGnd.closest("label").hidden = stm;
    if (stm) numberGnd.checked = false;
  }

  async function refreshStmPackages() {
    if (!lastPdfBuffer || !isStmFormat()) return;
    try {
      const packages = await detectStmPackagesFromPdf(lastPdfBuffer);
      stmPackage.innerHTML = "";
      if (!packages.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No STM package columns found";
        stmPackage.appendChild(opt);
        return;
      }
      for (const id of packages) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = STM_PACKAGES[id]?.label ?? id;
        stmPackage.appendChild(opt);
      }
      if (!packages.includes(stmPackage.value)) {
        stmPackage.value = packages.includes("VFQFPN68")
          ? "VFQFPN68"
          : packages[0];
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function copyText(text, label) {
    await navigator.clipboard.writeText(text);
    setStatus(label);
  }

  function getSeparator() {
    const value = functionSeparator?.value ?? "/";
    return value.length ? value : "/";
  }

  function getDisplayPins() {
    return applyDisplayOptions(lastPins, {
      numberGnd: numberGnd.checked,
      separator: getSeparator(),
    });
  }

  function renderColumns() {
    const pins = getDisplayPins();
    const cols = pinsToColumns(pins, includePinName.checked);
    columnsEl.innerHTML = "";
    emptyEl.hidden = true;

    const names = Object.keys(cols);
    const rowCount = cols[names[0]]?.length ?? 0;

    for (const name of names) {
      const col = document.createElement("div");
      col.className = "column";

      const header = document.createElement("div");
      header.className = "column-header";
      header.innerHTML = `<h3>${name}</h3>`;

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn secondary";
      copyBtn.textContent = "Copy column";
      copyBtn.addEventListener("click", () => {
        copyText(cols[name].join("\n"), `Copied ${rowCount} rows from “${name}”`);
      });
      header.appendChild(copyBtn);

      const list = document.createElement("textarea");
      list.className = "column-data";
      list.readOnly = true;
      list.value = cols[name].join("\n");
      list.rows = Math.min(24, Math.max(8, rowCount));

      col.append(header, list);
      columnsEl.appendChild(col);
    }

    setStatus(`${rowCount} pins ready — copy each column into Symbol Wizard`);
    copyTsvBtn.hidden = false;
  }

  async function onConvert() {
    showError("");
    const file = fileInput.files?.[0];
    if (!file) {
      showError("Choose a PDF file first.");
      return;
    }
    if (isStmFormat() && !stmPackage.value) {
      showError("No STM package variant detected in this PDF.");
      return;
    }

    convertBtn.disabled = true;
    setStatus("Reading PDF…");

    try {
      const buffer = await file.arrayBuffer();
      lastPdfBuffer = buffer.slice(0);
      const pins = await convertPdfBuffer(buffer, {
        format: datasheetFormat.value,
        packageId: stmPackage.value,
      });
      if (!pins.length) {
        const hint = isStmFormat()
          ? "Try an STM32 Table 16-style pinout with package columns (UFQFPN48, VFQFPN68, …)."
          : "Try an Espressif-style pin definitions table.";
        showError(`No pin table found. ${hint}`);
        emptyEl.hidden = false;
        columnsEl.innerHTML = "";
        setStatus("No pins found", true);
        return;
      }
      lastPins = pins;
      renderColumns();
    } catch (err) {
      console.error(err);
      showError(err.message || String(err));
      setStatus("Conversion failed", true);
    } finally {
      convertBtn.disabled = false;
    }
  }

  convertBtn.addEventListener("click", onConvert);
  datasheetFormat?.addEventListener("change", () => {
    updateFormatUi();
    refreshStmPackages();
    lastPins = [];
    columnsEl.innerHTML = "";
    emptyEl.hidden = false;
    copyTsvBtn.hidden = true;
    showError("");
  });
  stmPackage?.addEventListener("change", () => {
    if (lastPdfBuffer && isStmFormat()) onConvert();
  });
  includePinName.addEventListener("change", () => {
    if (lastPins.length) renderColumns();
  });
  numberGnd.addEventListener("change", () => {
    if (lastPins.length) renderColumns();
  });
  functionSeparator?.addEventListener("input", () => {
    if (lastPins.length) renderColumns();
  });
  root.querySelectorAll(".sep-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (functionSeparator) functionSeparator.value = btn.dataset.sep ?? "/";
      if (lastPins.length) renderColumns();
    });
  });
  copyTsvBtn?.addEventListener("click", async () => {
    if (!lastPins.length) return;
    const cols = pinsToColumns(getDisplayPins(), includePinName.checked);
    const names = Object.keys(cols);
    const rows = cols[names[0]].map((_, i) =>
      names.map((n) => cols[n][i]).join("\t")
    );
    await copyText([names.join("\t"), ...rows].join("\n"), "Copied full table (TSV)");
  });
  fileInput.addEventListener("change", async () => {
    if (fileInput.files?.[0]) {
      setStatus(`Selected: ${fileInput.files[0].name}`);
      showError("");
      try {
        lastPdfBuffer = (await fileInput.files[0].arrayBuffer()).slice(0);
        await refreshStmPackages();
      } catch (err) {
        console.error(err);
      }
    }
  });

  updateFormatUi();
}
