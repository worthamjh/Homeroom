// Notebooks: a store item that is a many-page PDF, one blank template per
// page, kept per unit. Jay: "the notebooks would have pdfs that are 25 or
// 50 pages and each page has a blank template on it. Some of the options
// would be like a CER template... A user could add it to their profile
// then select it... and the notebook would show up on the screen. Each
// unit would have its own notebook." The teacher writes in it on the
// smartboard through Kami, or students come up and write.
//
// The PDF for each template is a static file under public/notebooks --
// built once (public/notebooks/README) from the one-page sheet under
// public/papers, every page sharing the same drawing, so 50 pages cost
// about as much as one. On first open for a unit the file is fetched,
// uploaded to the teacher's Drive under "Notebooks", and the Kami link is
// kept on that unit's board content.
//
// Page count is fixed per template (Jay: "I guess its fixed per
// template?"). The id is what gets stored, so it never changes.
//
// Three CER editions, all Jay's sheets (2026-09-04; the earlier single
// "cer" template and the Flow edition are gone, and a board that still names it shows no
// notebook until another is chosen). `cover` is the short word on the
// drawn notebook's cover, `edition` the line under it -- the covers
// would otherwise look the same on the bulletin board.
export const NOTEBOOK_TEMPLATES = [
  {
    id: "cer-rubric",
    label: "CER Teacher Rubric",
    cover: "CER",
    edition: "Rubric",
    pages: 50,
    file: "/notebooks/cer-rubric-50.pdf",
    thumb: "/notebooks/thumbs/cer-rubric.png",
    blurb: "A 0–3 scoring rubric for Claim, Evidence and Reasoning at the top of every page, marked as it is read. 50 pages.",
  },
  {
    id: "cer-notebook",
    label: "CER Notebook",
    cover: "CER",
    edition: "Notebook",
    pages: 50,
    file: "/notebooks/cer-notebook-50.pdf",
    thumb: "/notebooks/thumbs/cer-notebook.png",
    blurb: "Ruled lines and a red margin, like a composition book, with sentence starters. 50 pages.",
  },
  {
    id: "cer-chalkboard",
    label: "CER Chalkboard",
    cover: "CER",
    edition: "Chalkboard",
    pages: 50,
    file: "/notebooks/cer-chalkboard-50.pdf",
    thumb: "/notebooks/thumbs/cer-chalkboard.png",
    blurb: "Chalk on green, framed in wood, like the board itself. Best for writing in a light colour. 50 pages.",
  },
];

export const NOTEBOOK_FOLDER_NAME = "Notebooks";

export function notebookTemplate(id) {
  return NOTEBOOK_TEMPLATES.find(t => t.id === id) || null;
}

export function isNotebookTemplateId(id) {
  return typeof id === "string" && NOTEBOOK_TEMPLATES.some(t => t.id === id);
}

// The Drive file name for one unit's notebook: "Chemistry CER Chalkboard
// Notebook — Unit 3". The course comes first because a teacher with two
// classrooms gets two Unit 1 notebooks in the same Drive folder (Jay,
// looking at a folder of "CER Notebook — Unit 1" files: "the CER
// Notebook title should have the course name like Chemistry CER Notebook
// or something plus the unit number"). "Notebook" is added unless the
// template's label already ends with it.
export function notebookDocTitle(template, unitLabel, courseLabel) {
  const course = (courseLabel || "").trim();
  const kind = /notebook$/i.test(template.label) ? template.label : `${template.label} Notebook`;
  return `${course ? `${course} ` : ""}${kind} — ${unitLabel || "Unit"}`;
}
