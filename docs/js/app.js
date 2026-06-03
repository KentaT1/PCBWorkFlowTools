import {
  applyDisplayOptions,
  convertPdfBuffer,
  pinsToColumns,
} from "./parser.js?v=7";

const $ = (sel) => document.querySelector(sel);

const fileInput = $("#pdf-file");
const includePinName = $("#include-pin-name");
const numberGnd = $("#number-gnd");
const convertBtn = $("#convert-btn");
const statusEl = $("#status");
const columnsEl = $("#columns");
const emptyEl = $("#empty-state");
const errorEl = $("#error");

let lastPins = [];

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

async function copyText(text, label) {
  await navigator.clipboard.writeText(text);
  setStatus(label);
}

function getDisplayPins() {
  return applyDisplayOptions(lastPins, { numberGnd: numberGnd.checked });
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
  $("#copy-tsv").hidden = false;
}

async function onConvert() {
  showError("");
  const file = fileInput.files?.[0];
  if (!file) {
    showError("Choose a PDF file first.");
    return;
  }

  convertBtn.disabled = true;
  setStatus("Reading PDF…");

  try {
    const buffer = await file.arrayBuffer();
    const pins = await convertPdfBuffer(buffer);
    if (!pins.length) {
      showError("No pin table found. Try an Espressif-style pin definitions table.");
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
includePinName.addEventListener("change", () => {
  if (lastPins.length) renderColumns();
});
numberGnd.addEventListener("change", () => {
  if (lastPins.length) renderColumns();
});

const copyTsvBtn = $("#copy-tsv");
copyTsvBtn?.addEventListener("click", async () => {
  if (!lastPins.length) return;
  const cols = pinsToColumns(getDisplayPins(), includePinName.checked);
  const names = Object.keys(cols);
  const rows = cols[names[0]].map((_, i) => names.map((n) => cols[n][i]).join("\t"));
  await copyText([names.join("\t"), ...rows].join("\n"), "Copied full table (TSV)");
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) {
    setStatus(`Selected: ${fileInput.files[0].name}`);
    showError("");
  }
});
