// Notebooks: a store item that is a many-page PDF, one blank template per
// page, kept per unit. Jay: "the notebooks would have pdfs that are 25 or
// 50 pages and each page has a blank template on it. Some of the options
// would be like a CER template... A user could add it to their profile
// then select it... and the notebook would show up on the screen. Each
// unit would have its own notebook." The teacher writes in it on the
// smartboard through Kami, or students come up and write.
//
// The PDF for each template is a static file under public/notebooks --
// built once (public/notebooks/README) with every page pointing at the
// same drawing, so 25 pages cost about as much as one. On first open for
// a unit the file is fetched, uploaded to the teacher's Drive under
// "Notebooks", and the Kami link is kept on that unit's board content.
//
// Page count is fixed per template (Jay: "I guess its fixed per
// template?"). The id is what gets stored, so it never changes.
export const NOTEBOOK_TEMPLATES = [
  {
    id: "cer",
    label: "CER Notebook",
    pages: 25,
    file: "/notebooks/cer-25.pdf",
    thumb: "/papers/thumbs/cer.png",
    blurb: "Claim, Evidence, Reasoning. 25 pages, one response per page.",
  },
];

export const NOTEBOOK_FOLDER_NAME = "Notebooks";

export function notebookTemplate(id) {
  return NOTEBOOK_TEMPLATES.find(t => t.id === id) || null;
}

export function isNotebookTemplateId(id) {
  return typeof id === "string" && NOTEBOOK_TEMPLATES.some(t => t.id === id);
}

// The Drive file name for one unit's notebook.
export function notebookDocTitle(template, unitLabel) {
  return `${template.label} — ${unitLabel || "Unit"}`;
}
