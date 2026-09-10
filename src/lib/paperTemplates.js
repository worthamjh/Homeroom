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

const RULE_TOP = PAGE_H - 1.0 * PT_PER_INCH;    // the header space filler paper has
const RULE_BOTTOM = 0;
const VERTICAL_MARGIN_X = 1.25 * PT_PER_INCH;   // the red line down the left

const BLUE = "0.62 0.76 0.90";
const RED = "0.93 0.66 0.66";
const GREY = "0.80 0.84 0.88";

function ruledContent(pitch) {
  const ops = [`${BLUE} RG`, "0.7 w"];
  // Edge to edge, like a real sheet of filler paper.
  for (let y = RULE_TOP; y >= RULE_BOTTOM; y -= pitch) {
    ops.push(`0 ${y.toFixed(2)} m ${PAGE_W} ${y.toFixed(2)} l S`);
  }
  // Vertical margin rule, top edge to bottom edge.
  ops.push(`${RED} RG`, "0.9 w");
  ops.push(`${VERTICAL_MARGIN_X.toFixed(2)} ${PAGE_H} m ${VERTICAL_MARGIN_X.toFixed(2)} 0 l S`);
  return ops.join("\n");
}

// Squared paper: the grid covers the whole sheet corner to corner, rather
// than sitting as a chart area printed on a page.
function gridContent() {
  const ops = [`${GREY} RG`, "0.5 w"];
  for (let x = 0; x <= PAGE_W + 0.01; x += GRID) {
    ops.push(`${x.toFixed(2)} 0 m ${x.toFixed(2)} ${PAGE_H} l S`);
  }
  for (let y = 0; y <= PAGE_H + 0.01; y += GRID) {
    ops.push(`0 ${y.toFixed(2)} m ${PAGE_W} ${y.toFixed(2)} l S`);
  }
  return ops.join("\n");
}

// Question papers (2026-09-10). A bell ringer opened from the agenda is to
// show up on the smartboard as a picture of just the question, not the
// clipped Kami frame; these sheets mark the band that picture is taken
// from, so the teacher can see what the class will get. Jay's geometry:
//   one question  -> top 20% of the page is the question band.
//   two questions -> 20% question, 30% answer, 20% question, 30% answer,
//                    and the two question bands stack into one 16:9 picture.
// `boardBands` on the paper entry is the same geometry as fractions of the
// page height from the top, for whatever crops the Drive rendering later.
// The bands are blank (a clean picture); the answer areas are wide ruled.
// The label sits just BELOW the dotted line, in the answer area, so it is
// never in the picture.
const DOT = "0.55 0.58 0.62";
const LABEL = "0.62 0.65 0.68";
const BOARD_LABEL = "above the dotted line shows on the board";

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

// Small grey caption, right-aligned under a dotted line. Helvetica is one
// of the standard fourteen fonts every PDF viewer carries, so it needs no
// embedding; its average glyph is about half an em wide, which is close
// enough to right-align a short caption.
function caption(text, y, size = 7) {
  const approxWidth = text.length * size * 0.5;
  const x = PAGE_W - 0.5 * PT_PER_INCH - approxWidth;
  return [`BT /F1 ${size} Tf ${LABEL} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`];
}

// Question bands as fractions of the page height from the top, [top, bottom].
const ONE_QUESTION_BANDS = [[0, 0.2]];
const TWO_QUESTION_BANDS = [[0, 0.2], [0.5, 0.7]];

function questionContent(bands) {
  const ops = [];
  bands.forEach(([topFrac, bottomFrac], i) => {
    const bandTop = PAGE_H * (1 - topFrac);
    const bandBottom = PAGE_H * (1 - bottomFrac);
    // A solid line where a second question band begins, so the answer
    // area above it has a visible end and the next question a top edge.
    if (i > 0) ops.push(`${DOT} RG`, "1 w", `0 ${bandTop.toFixed(2)} m ${PAGE_W} ${bandTop.toFixed(2)} l S`);
    ops.push(...dottedLine(bandBottom));
    ops.push(...caption(BOARD_LABEL, bandBottom - 9));
    const nextTop = bands[i + 1] ? PAGE_H * (1 - bands[i + 1][0]) : 0;
    // Wide rules for the answer area, starting a rule's width under the
    // caption so the first line of writing has room.
    ops.push(...rulesBetween(bandBottom - 14, nextTop, WIDE_RULE));
  });
  return ops.join("\n");
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
  { id: "builtin:plain", label: "Plain", thumb: "/papers/thumbs/plain.png", build: () => buildPdf("") },
  { id: "builtin:wide", label: "Wide Ruled", thumb: "/papers/thumbs/wide.png", build: () => buildPdf(ruledContent(WIDE_RULE)) },
  { id: "builtin:college", label: "College Ruled", thumb: "/papers/thumbs/college.png", build: () => buildPdf(ruledContent(COLLEGE_RULE)) },
  { id: "builtin:graph", label: "Graph Paper", thumb: "/papers/thumbs/graph.png", build: () => buildPdf(gridContent()) },
  // Question papers: the dotted band is what the smartboard shows. See the
  // note above questionContent.
  { id: "builtin:question1", label: "One Question", thumb: "/papers/thumbs/question1.png", boardBands: ONE_QUESTION_BANDS, build: () => buildPdf(questionContent(ONE_QUESTION_BANDS), HELVETICA) },
  { id: "builtin:question2", label: "Two Questions", thumb: "/papers/thumbs/question2.png", boardBands: TWO_QUESTION_BANDS, build: () => buildPdf(questionContent(TWO_QUESTION_BANDS), HELVETICA) },
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
