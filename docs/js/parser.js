/**
 * PDF pin table parsers → Altium Symbol Wizard columns.
 */

import { espressifParser, convertEspressifPdf } from "./parsers/espressif.js";
import {
  stm32Parser,
  convertStm32Pdf,
  detectStmPackagesFromPdf,
  STM_PACKAGES,
} from "./parsers/stm32-pinout.js";

export const APP_VERSION = "1.2.0";

export const PARSERS = {
  espressif: espressifParser,
  stm32: stm32Parser,
};

export function joinFunctionTokens(tokens, separator = "/") {
  if (!tokens.length) return "";
  return tokens.join(separator);
}

/**
 * @param {{designator:number|string, displayName:string, functionTokens:string[]|null, electricalType:string, pinName:string}[]} pins
 * @param {{ numberGnd?: boolean, separator?: string }} [options]
 */
export function applyDisplayOptions(pins, options = {}) {
  const separator = options.separator ?? "/";
  return pins.map((p) => {
    let displayName = p.displayName;
    if (p.functionTokens?.length) {
      displayName = joinFunctionTokens(p.functionTokens, separator);
    }
    if (options.numberGnd && displayName === "GND") {
      const num = String(p.designator).padStart(2, "0");
      displayName = `GND_${num}`;
    }
    return { ...p, displayName };
  });
}

export function pinsToColumns(pins, includePinName = false) {
  const columns = {
    Designator: pins.map((p) => String(p.designator)),
    "Display Name": pins.map((p) => p.displayName),
    "Electrical Type": pins.map((p) => p.electricalType),
  };
  if (includePinName) {
    columns["Pin Name"] = pins.map((p) => p.pinName);
  }
  return columns;
}

/**
 * @param {ArrayBuffer} pdfData
 * @param {{ format?: string, packageId?: string }} [options]
 */
export async function convertPdfBuffer(pdfData, options = {}) {
  const format = options.format ?? "espressif";
  if (format === "stm32") {
    return convertStm32Pdf(pdfData, { packageId: options.packageId });
  }
  return convertEspressifPdf(pdfData);
}

export { detectStmPackagesFromPdf, STM_PACKAGES };
