// Built-in bell ringer papers, generated rather than shipped as files.
//
// A ruled page is horizontal rules at a fixed pitch and graph paper is a
// grid, both of which PDF expresses directly as vectors. Generating them
// means they stay sharp at any zoom, weigh a couple of KB instead of the
// ~25KB a scanned image costs, and the ruling is a number here that can be
// tuned rather than a file that has to be re-sourced.
//
// These are uploaded to the teacher's Drive when chosen -- `drive.file`
// scope already allows creating files, and the app owns what it creates,
// so built-ins need no picker and no per-file grant.

const PT_PER_INCH = 72;
const PAGE_W = 8.5 * PT_PER_INCH;   // 612 — US Letter
const PAGE_H = 11 * PT_PER_INCH;    // 792

// Real paper measurements: wide ruled is 11/32", college 9/32".
const WIDE_RULE = (11 / 32) * PT_PER_INCH;    // 24.75
const COLLEGE_RULE = (9 / 32) * PT_PER_INCH;  // 20.25
const GRID = 0.25 * PT_PER_INCH;              // 18 — quarter-inch squares

const BLUE = "0.62 0.76 0.90";
const GREY = "0.80 0.84 0.88";

// The question band (2026-09-10). A bell ringer opened from the agenda
// shows up on the smartboard as a picture of just the question, not the
// clipped Kami frame; every sheet marks the band that picture is taken
// from, so the teacher can see what the class will get. Jay's geometry:
// the top 20% of the page is the question band. `boardBands` on the paper
// entry is the same geometry as fractions of the page height from the
// top, for whatever crops the Drive rendering later. The band is blank (a
// clean picture); the answer area below it carries the paper's ruling.
// The label sits just BELOW the dotted line, in the answer area, so it is
// never in the picture.
//
// It began as two "question papers" beside plain, ruled and squared
// sheets. On 2026-09-29 Jay put the band on every sheet ("I like the gray
// rectangle shape indicating what part of the document will be auto
// zoomed in on ... I would like that same shape on all of the templates"),
// folded One Question into Wide Ruled and dropped Two Questions.
const DOT = "0.55 0.58 0.62";
const LABEL = "0.62 0.65 0.68";
const BOARD_LABEL = "the dotted box is what shows on the board";
// The overlay shows the band through a 16:9 window (see KamiOverlay in
// WebsterGrovesChemistry.jsx), so the part of the band the class sees is
// a 16:9 box as tall as the band, centred on the page. It is drawn on the
// sheet as the place to put the question (Jay: "an exact rectangle that
// will take up the space that the minimized mode occupies").
const BOARD_ASPECT = 16 / 9;

function rulesBetween(top, bottom, pitch) {
  const ops = [`${BLUE} RG`, "0.7 w"];
  for (let y = top - pitch; y >= bottom + 0.01; y -= pitch) {
    ops.push(`0 ${y.toFixed(2)} m ${PAGE_W} ${y.toFixed(2)} l S`);
  }
  return ops;
}

function dottedLine(y) {
  return [`${DOT} RG`, "1 w", "[3 4] 0 d", `0 ${y.toFixed(2)} m ${PAGE_W} ${y.toFixed(2)} l S`, "[] 0 d"];
}

// The board window inside a band: 16:9, the band's full height, centred.
// Three dotted sides; the band's own dotted line is the fourth. The top
// side sits a hair inside the band so it is visible when the band starts
// at the page edge.
function boardBox(bandTop, bandBottom) {
  const h = bandTop - bandBottom;
  const w = h * BOARD_ASPECT;
  const x0 = (PAGE_W - w) / 2, x1 = x0 + w;
  const top = Math.min(bandTop - 3, PAGE_H - 3);
  return [`${DOT} RG`, "1 w", "[3 4] 0 d",
    `${x0.toFixed(2)} ${bandBottom.toFixed(2)} m ${x0.toFixed(2)} ${top.toFixed(2)} l ${x1.toFixed(2)} ${top.toFixed(2)} l ${x1.toFixed(2)} ${bandBottom.toFixed(2)} l S`,
    "[] 0 d"];
}

function boardBoxRight(bandTop, bandBottom) {
  return (PAGE_W + (bandTop - bandBottom) * BOARD_ASPECT) / 2;
}

// Small grey caption, right-aligned under a dotted line. Helvetica is one
// of the standard fourteen fonts every PDF viewer carries, so it needs no
// embedding; its average glyph is about half an em wide, which is close
// enough to right-align a short caption.
function caption(text, y, size = 7, right = PAGE_W - 0.5 * PT_PER_INCH) {
  const approxWidth = text.length * size * 0.5;
  const x = right - approxWidth;
  return [`BT /F1 ${size} Tf ${LABEL} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`];
}

// The question band as a fraction of the page height from the top,
// [top, bottom]: the top fifth, on every sheet.
const QUESTION_BANDS = [[0, 0.2]];

// One sheet: the band with its dotted line, board box and caption, then
// the answer area below, filled by `answerArea(top, bottom)` -- rules at
// a pitch, a grid, or nothing at all for plain.
function boardContent(bands, answerArea) {
  const ops = [];
  bands.forEach(([topFrac, bottomFrac], i) => {
    const bandTop = PAGE_H * (1 - topFrac);
    const bandBottom = PAGE_H * (1 - bottomFrac);
    ops.push(...dottedLine(bandBottom));
    ops.push(...boardBox(bandTop, bandBottom));
    ops.push(...caption(BOARD_LABEL, bandBottom - 9, 7, boardBoxRight(bandTop, bandBottom)));
    const nextTop = bands[i + 1] ? PAGE_H * (1 - bands[i + 1][0]) : 0;
    // The answer area starts a rule's width under the caption so the
    // first line of writing has room.
    if (answerArea) ops.push(...answerArea(bandBottom - 14, nextTop));
  });
  return ops.join("\n");
}

// Squared answer area: quarter-inch grid, edge to edge, from the top of
// the area to the foot of the page.
function gridBetween(top, bottom) {
  const ops = [`${GREY} RG`, "0.5 w"];
  for (let x = 0; x <= PAGE_W + 0.01; x += GRID) {
    ops.push(`${x.toFixed(2)} ${bottom.toFixed(2)} m ${x.toFixed(2)} ${top.toFixed(2)} l S`);
  }
  for (let y = top; y >= bottom - 0.01; y -= GRID) {
    ops.push(`0 ${y.toFixed(2)} m ${PAGE_W} ${y.toFixed(2)} l S`);
  }
  return ops;
}

const HELVETICA = "<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>";

// Minimal single-page PDF. The xref table needs each object's byte offset,
// so the body is assembled first and measured as it goes.
function buildPdf(content, resources = "<< >>") {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources ${resources} >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(off => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
}

// id is what gets stored; label is what a teacher sees in the menu; thumb
// is a rendering of the actual page (public/papers/thumbs, made from these
// same PDFs) so the store shows the sheet itself rather than a sketch of
// it. Jay: "make the images of the previews bigger so the user can see
// what they look like in full on the thumbnail."
export const BUILT_IN_PAPERS = [
  // Every sheet is the question band at the top -- the dotted box is what
  // the smartboard shows when the doc is opened from the agenda -- over an
  // answer area in the paper's ruling. A doc made on the old One Question
  // or Two Questions sheet still reads its band as the top fifth, which is
  // what it was (DEFAULT_BOARD_BANDS in bellRingerPicture.js).
  { id: "builtin:plain", label: "Plain", thumb: "/papers/thumbs/plain.png", boardBands: QUESTION_BANDS, build: () => buildPdf(boardContent(QUESTION_BANDS, null), HELVETICA) },
  { id: "builtin:wide", label: "Wide Ruled", thumb: "/papers/thumbs/wide.png", boardBands: QUESTION_BANDS, build: () => buildPdf(boardContent(QUESTION_BANDS, (top, bottom) => rulesBetween(top, bottom, WIDE_RULE)), HELVETICA) },
  { id: "builtin:college", label: "College Ruled", thumb: "/papers/thumbs/college.png", boardBands: QUESTION_BANDS, build: () => buildPdf(boardContent(QUESTION_BANDS, (top, bottom) => rulesBetween(top, bottom, COLLEGE_RULE)), HELVETICA) },
  { id: "builtin:graph", label: "Graph Paper", thumb: "/papers/thumbs/graph.png", boardBands: QUESTION_BANDS, build: () => buildPdf(boardContent(QUESTION_BANDS, gridBetween), HELVETICA) },
  // A paper may also be a designed page shipped as a static PDF (`file`
  // instead of `build`), fetched at create time. The CER sheet was one for
  // two days; as of 2026-09-04 CER is a notebook only (Jay: "lets actually
  // remove the cer template from the bellringer and exit slip section"),
  // so nothing uses `file` today. The path stays for the next designed
  // sheet.
];

export function isBuiltInPaper(id) {
  return typeof id === "string" && id.startsWith("builtin:");
}

export async function buildBuiltInPaperPdf(id) {
  const paper = BUILT_IN_PAPERS.find(p => p.id === id);
  if (!paper) return null;
  if (paper.file) {
    const res = await fetch(paper.file);
    if (!res.ok) throw new Error(`Couldn't load the ${paper.label} paper (${res.status}).`);
    return res.blob();
  }
  // Latin-1: PDF operators are ASCII, so a byte-per-char conversion is exact.
  const text = paper.build();
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
