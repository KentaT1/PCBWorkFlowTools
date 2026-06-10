import { APP_VERSION } from "./parser.js?v=13";
import { initPinsTool } from "./tools/pins-tool.js?v=13";
import { initPcbDxfTool } from "./tools/pcb-dxf-tool.js?v=13";

const $ = (sel) => document.querySelector(sel);

const versionBadge = $("#app-version");
if (versionBadge) versionBadge.textContent = `v${APP_VERSION}`;

const TOOL_COPY = {
  pins: {
    title: "PDF → Altium Pin Table",
    description:
      "Upload a datasheet pin-definition PDF (Espressif ESP32 or STM32 pinout tables). Get separate columns for Designator, Display Name, and Electrical Type to paste into Altium’s Symbol Wizard.",
  },
  "pcb-dxf": {
    title: "PCB Image → DXF Outline",
    description:
      "Upload a photo or render of a PCB. Trace the board outline and download a clean DXF polyline for mechanical CAD or enclosure design. Processing runs entirely in your browser.",
  },
};

const toolPanels = {
  pins: $("#tool-pins"),
  "pcb-dxf": $("#tool-pcb-dxf"),
};

const headerTitle = $("#header-title");
const headerDesc = $("#header-desc");

function setActiveTool(toolId) {
  document.querySelectorAll(".tool-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tool === toolId);
  });
  for (const [id, panel] of Object.entries(toolPanels)) {
    if (panel) panel.hidden = id !== toolId;
  }
  const copy = TOOL_COPY[toolId] ?? TOOL_COPY.pins;
  if (headerTitle) headerTitle.textContent = copy.title;
  if (headerDesc) headerDesc.textContent = copy.description;
  document.title = `${copy.title} · PCB WorkFlow Tools`;
  sessionStorage.setItem("pcbwf-tool", toolId);
}

document.querySelectorAll(".tool-tab").forEach((tab) => {
  tab.addEventListener("click", () => setActiveTool(tab.dataset.tool));
});

initPinsTool(toolPanels.pins);
initPcbDxfTool(toolPanels["pcb-dxf"]);

const saved = sessionStorage.getItem("pcbwf-tool");
setActiveTool(saved === "pcb-dxf" ? "pcb-dxf" : "pins");
