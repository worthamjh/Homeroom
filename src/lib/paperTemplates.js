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

// Minimal single-page PDF. The xref table needs each object's byte offset,
// so the body is assembled first and measured as it goes.
function buildPdf(content) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents 4 0 R /Resources << >> >>`,
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

// id is what gets stored; label is what a teacher sees in the menu.
export const BUILT_IN_PAPERS = [
  { id: "builtin:plain", label: "Plain", build: () => buildPdf("") },
  { id: "builtin:wide", label: "Wide Ruled", build: () => buildPdf(ruledContent(WIDE_RULE)) },
  { id: "builtin:college", label: "College Ruled", build: () => buildPdf(ruledContent(COLLEGE_RULE)) },
  { id: "builtin:graph", label: "Graph Paper", build: () => buildPdf(gridContent()) },
];

export function isBuiltInPaper(id) {
  return typeof id === "string" && id.startsWith("builtin:");
}

export function buildBuiltInPaperPdf(id) {
  const paper = BUILT_IN_PAPERS.find(p => p.id === id);
  if (!paper) return null;
  // Latin-1: PDF operators are ASCII, so a byte-per-char conversion is exact.
  const text = paper.build();
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
