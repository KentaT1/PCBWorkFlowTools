/**
 * Extract a PCB board outline from a raster image (client-side).
 */

const MAX_DIM = 1600;

/**
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} source
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number, scale: number }}
 */
export function imageToWorkingCanvas(source) {
  const srcW = source.width;
  const srcH = source.height;
  const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return { canvas, width, height, scale };
}

/**
 * @param {Uint8ClampedArray} data RGBA
 */
function grayscale(data) {
  const out = new Float32Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * @param {Float32Array} gray
 * @param {number} threshold 0–255
 * @param {boolean} invert
 */
export function buildMask(gray, width, height, threshold, invert) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const on = gray[i] < threshold;
    mask[i] = invert ? (on ? 0 : 1) : on ? 1 : 0;
  }
  return mask;
}

function isGreenPcbPixel(r, g, b) {
  return (
    g > 35 &&
    g > r * 1.12 + 8 &&
    g > b * 1.12 + 8 &&
    !(r > 185 && g > 185 && b > 185)
  );
}

/** Green solder mask on dark background (excludes white silkscreen). */
export function buildGreenPcbMask(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    mask[p] = isGreenPcbPixel(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
  return mask;
}

function greenPixelRatio(data, width, height) {
  let count = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (isGreenPcbPixel(data[i], data[i + 1], data[i + 2])) count++;
  }
  return count / (width * height);
}

function maskForegroundRatio(mask) {
  let fg = 0;
  for (const v of mask) if (v) fg++;
  return fg / mask.length;
}

function dilate(mask, width, height, iterations = 1) {
  let cur = mask;
  for (let n = 0; n < iterations; n++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
              v = Math.max(v, cur[ny * width + nx]);
            }
          }
        }
        next[y * width + x] = v;
      }
    }
    cur = next;
  }
  return cur;
}

function erode(mask, width, height, iterations = 1) {
  let cur = mask;
  for (let n = 0; n < iterations; n++) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
              v = Math.min(v, cur[ny * width + nx]);
            } else {
              v = 0;
            }
          }
        }
        next[y * width + x] = v;
      }
    }
    cur = next;
  }
  return cur;
}

function closeMask(mask, width, height) {
  return erode(dilate(mask, width, height, 1), width, height, 1);
}

function labelComponents(mask, width, height) {
  const labels = new Int32Array(mask.length);
  let current = 0;
  const areas = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!mask[idx] || labels[idx]) continue;
      current++;
      let area = 0;
      const stack = [idx];
      labels[idx] = current;
      while (stack.length) {
        const i = stack.pop();
        area++;
        const cx = i % width;
        const cy = (i / width) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !labels[ni]) {
            labels[ni] = current;
            stack.push(ni);
          }
        }
      }
      areas[current] = area;
    }
  }
  return { labels, areas, count: current };
}

function touchesBorder(labels, width, height, labelId) {
  for (let x = 0; x < width; x++) {
    if (labels[x] === labelId) return true;
    if (labels[(height - 1) * width + x] === labelId) return true;
  }
  for (let y = 0; y < height; y++) {
    if (labels[y * width] === labelId) return true;
    if (labels[y * width + width - 1] === labelId) return true;
  }
  return false;
}

function componentBbox(labels, labelId, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y * width + x] !== labelId) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!found) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pickBoardLabel(mask, labels, areas, count, width, height) {
  const total = width * height;
  const minArea = total * 0.04;
  const maxArea = total * 0.82;
  let best = -1;
  let bestScore = -1;

  for (let id = 1; id <= count; id++) {
    const area = areas[id] ?? 0;
    if (!area || area < minArea || area > maxArea) continue;

    const border = touchesBorder(labels, width, height, id);
    const bb = componentBbox(labels, id, width, height);
    if (!bb || bb.width < 12 || bb.height < 12) continue;

    let score = area;
    if (border) score *= 0.12;
    const fill = area / Math.max(1, (bb.width + 2) * (bb.height + 2));
    if (fill < 0.2) score *= 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }

  if (best < 0) {
    throw new Error(
      "No board shape found. Try Green PCB detection or adjust threshold/invert."
    );
  }

  const board = new Uint8Array(mask.length);
  for (let i = 0; i < labels.length; i++) {
    board[i] = labels[i] === best ? 1 : 0;
  }
  return board;
}

function isBoundary(mask, width, height, x, y) {
  const idx = y * width + x;
  if (!mask[idx]) return false;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
      return true;
    }
  }
  return false;
}

const MOORE_DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function findBoundaryStart(mask, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBoundary(mask, width, height, x, y)) return { x, y };
    }
  }
  return null;
}

/** Moore-neighbor outer contour trace (robust on complex board shapes). */
function traceBoundary(mask, width, height) {
  const start = findBoundaryStart(mask, width, height);
  if (!start) throw new Error("Could not trace board outline.");

  const path = [];
  let x = start.x;
  let y = start.y;
  let dir = 0;
  const maxSteps = width * height * 2;
  let steps = 0;

  do {
    path.push({ x, y });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (dir + i + 5) % 8;
      const nx = x + MOORE_DIRS[d][0];
      const ny = y + MOORE_DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!isBoundary(mask, width, height, nx, ny)) continue;
      x = nx;
      y = ny;
      dir = d;
      found = true;
      break;
    }
    if (!found) break;
    steps++;
  } while ((x !== start.x || y !== start.y || path.length < 4) && steps < maxSteps);

  if (path.length < 8) {
    throw new Error("Outline too small — try Green PCB detection or adjust threshold.");
  }
  return path;
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Ramer–Douglas–Peucker simplification. */
export function simplifyPath(points, epsilon) {
  if (points.length <= 2 || epsilon <= 0) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, index + 1), epsilon);
    const right = simplifyPath(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

function pathLengthPx(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

function bbox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * @param {{x:number,y:number}[]} points pixels, origin top-left
 * @param {number} mmPerPx
 */
export function pixelsToMm(points, width, height, mmPerPx) {
  const bb = bbox(points);
  return points.map((p) => ({
    x: (p.x - bb.minX) * mmPerPx,
    y: (bb.maxY - p.y) * mmPerPx,
  }));
}

function buildMaskForMode(data, gray, width, height, mode, options) {
  if (mode === "green") {
    let mask = buildGreenPcbMask(data, width, height);
    if (options.smooth !== false) mask = closeMask(mask, width, height);
    return { mask, threshold: null };
  }
  const threshold = options.threshold ?? Math.round(otsuThreshold(gray));
  const invert =
    mode === "bright" ? true : mode === "dark" ? false : Boolean(options.invert);
  let mask = buildMask(gray, width, height, threshold, invert);
  if (options.smooth !== false) mask = closeMask(mask, width, height);
  return { mask, threshold };
}

function extractFromMask(mask, width, height, options) {
  const { labels, areas, count } = labelComponents(mask, width, height);
  const boardMask = pickBoardLabel(mask, labels, areas, count, width, height);
  let path = traceBoundary(boardMask, width, height);
  path = simplifyPath(path, options.simplify ?? 1.5);
  const bb = bbox(path);
  return { boardMask, path, bb };
}

function resolveMaskModes(data, width, height, requested) {
  if (requested && requested !== "auto") return [requested];
  const modes = [];
  if (greenPixelRatio(data, width, height) > 0.04) modes.push("green");
  modes.push("dark", "bright");
  return [...new Set(modes)];
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ threshold?: number|null, invert?: boolean, simplify?: number, mmPerPx?: number|null, boardWidthMm?: number|null, smooth?: boolean, detection?: string }} options
 */
export function extractOutlineFromCanvas(canvas, options = {}) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = grayscale(data);
  const modes = resolveMaskModes(data, width, height, options.detection);

  let lastError = null;
  let best = null;

  for (const mode of modes) {
    try {
      const { mask, threshold } = buildMaskForMode(data, gray, width, height, mode, options);
      const fg = maskForegroundRatio(mask);
      if (fg < 0.03 || fg > 0.9) continue;

      const extracted = extractFromMask(mask, width, height, options);
      const aspect =
        extracted.bb.width / Math.max(1, extracted.bb.height);
      if (aspect < 0.2 || aspect > 5) continue;
      if (extracted.path.length < 24) continue;

      const score =
        extracted.path.length * 2000 +
        extracted.bb.width * extracted.bb.height +
        (mode === "green" ? 250000 : 0);
      if (!best || score > best.score) {
        best = { mode, threshold, mask, ...extracted, score };
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!best) {
    throw (
      lastError ??
      new Error("Could not trace board outline. Try Green PCB detection or adjust threshold.")
    );
  }

  const { boardMask, path, bb, mode, threshold, mask } = best;
  let mmPerPx = options.mmPerPx;
  if (options.boardWidthMm && bb.width > 0) {
    mmPerPx = options.boardWidthMm / bb.width;
  }
  if (!mmPerPx || mmPerPx <= 0) mmPerPx = 0.1;

  const mmPoints = pixelsToMm(path, width, height, mmPerPx);

  return {
    threshold,
    detection: mode,
    mmPerPx,
    pixelPath: path,
    mmPath: mmPoints,
    pointCount: mmPoints.length,
    perimeterMm: pathLengthPx(path) * mmPerPx,
    boardWidthMm: bb.width * mmPerPx,
    boardHeightMm: bb.height * mmPerPx,
    boardMask,
    width,
    height,
  };
}

/**
 * @param {Uint8Array} mask
 * @param {{x:number,y:number}[]} path
 * @param {number} width
 * @param {number} height
 */
export function renderMaskPreview(mask, path, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < mask.length; i++) {
    const j = i * 4;
    if (mask[i]) {
      image.data[j] = 60;
      image.data[j + 1] = 140;
      image.data[j + 2] = 255;
      image.data[j + 3] = 90;
    } else {
      image.data[j + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (path?.length) {
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.closePath();
    ctx.stroke();
  }
  return canvas;
}
