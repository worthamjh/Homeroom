// The picture of a bell ringer that sits on the smartboard when it is
// opened from the agenda (Jay, 2026-09-10: "the thumbnail shows up on top
// of the smartboard, with the fullscreen and close buttons like they are
// now. then the full screen button opens up the pdf that corresponds to
// the thumbnail").
//
// The picture is Drive's own rendering of page one of the bell ringer
// file (fetchDriveFilePicture), cropped to the question band(s) the paper
// marked with a dotted line (BUILT_IN_PAPERS[].boardBands) and laid onto a
// 16:9 canvas the size of the smartboard. A paper with no bands -- Plain,
// Graph, a pasted doc -- gets the One Question band, the top fifth of the
// page, which is where a question goes on any sheet.
//
// The last picture for each file is kept in localStorage so the board
// shows something the instant the agenda is clicked; the fresh one
// replaces it when Drive answers.
import { BUILT_IN_PAPERS } from "./paperTemplates";
import { fetchDriveFilePicture } from "./googleDrive";

export const DEFAULT_BOARD_BANDS = [[0, 0.2]];

export function boardBandsForPaper(paperId) {
  const paper = BUILT_IN_PAPERS.find(p => p.id === paperId);
  return paper?.boardBands || DEFAULT_BOARD_BANDS;
}

// Crops each band out of the page image, scales it to the picture's
// width, and stacks the strips centred on a dark ground with a small gap,
// shrinking the stack if it would overflow. Returns a JPEG data URL (a
// couple of hundred KB at most), which is what the <img> and the cache
// both take.
export async function composeBoardPicture(blob, bands, { width = 1600, height = 900, gap = 12 } = {}) {
  const bitmap = await createImageBitmap(blob);
  try {
    const w = bitmap.width, h = bitmap.height;
    const scale = width / w;
    const strips = bands.map(([top, bottom]) => ({ sy: top * h, sh: (bottom - top) * h }));
    const stackHeight = strips.reduce((sum, s) => sum + s.sh * scale, 0) + gap * (strips.length - 1);
    const fit = stackHeight > height ? height / stackHeight : 1;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);
    const dw = width * fit;
    const x = (width - dw) / 2;
    let y = (height - stackHeight * fit) / 2;
    for (const s of strips) {
      const dh = s.sh * scale * fit;
      ctx.drawImage(bitmap, 0, s.sy, w, s.sh, x, y, dw, dh);
      y += dh + gap * fit;
    }
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    bitmap.close?.();
  }
}

const CACHE_PREFIX = "gb:bellPic:";
const CACHE_KEEP = 8;

export function readCachedBoardPicture(fileId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + fileId);
    if (!raw) return null;
    const { dataUrl, at } = JSON.parse(raw);
    return dataUrl ? { dataUrl, at } : null;
  } catch { return null; }
}

function writeCachedBoardPicture(fileId, dataUrl) {
  try {
    localStorage.setItem(CACHE_PREFIX + fileId, JSON.stringify({ dataUrl, at: Date.now() }));
    // Keep the cache to a handful of files, oldest out first.
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      try { entries.push({ k, at: JSON.parse(localStorage.getItem(k) || "{}").at || 0 }); } catch { entries.push({ k, at: 0 }); }
    }
    entries.sort((a, b) => b.at - a.at).slice(CACHE_KEEP).forEach(e => localStorage.removeItem(e.k));
  } catch { /* quota or private mode: the picture still shows this once */ }
}

// The fresh picture for a file, or null when Drive cannot be asked (no
// cached token, an unreadable file, no rendering yet). Never prompts.
export async function loadBoardPicture(fileId, bands) {
  const got = await fetchDriveFilePicture(fileId);
  if (!got) return null;
  try {
    const dataUrl = await composeBoardPicture(got.blob, bands);
    writeCachedBoardPicture(fileId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
