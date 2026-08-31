import { useState, useEffect, useRef } from "react";
import ChalkboardBoardRow, { toGoalPanels } from "./ChalkboardBoardRow";
import { useFullAgendaFields, ObjectivesChecklist, EditableField, ResetBoardButton } from "./FullAgendaBoard";
import { fetchExtraAssignments, createExtraAssignment, deleteExtraAssignment, updateExtraAssignment, reorderExtraAssignments } from "./lib/extraAssignments";
import { uploadAssignmentPdf } from "./lib/cloudinary";
import { googleDriveConfigured, ensureGoogleScriptsLoaded, pickGoogleSlidesEmbed, pickGoogleDriveAssignmentFile, pickGoogleCalendar } from "./lib/googleDrive";
import { fetchProfile } from "./lib/profileApi";
import { fetchCurriculum, saveCurriculum } from "./lib/curriculumApi";
import { fetchCheckedGoals, saveCheckedGoals } from "./lib/checkedGoalsApi";
import { fetchBoardContent, saveBoardContent } from "./lib/boardContentApi";
import {
  scopedKey, useScopedSetting,
  getActiveTeacherId, DEFAULT_TEACHER_ID,
  boardThemeVars,
  readCalendarUrl, writeCalendarUrl,
  readLessonSlidesUrl, writeLessonSlidesUrl,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  BULLETIN_STYLES, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_COMPONENTS,
  GOALS_STORAGE_KEY,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallBackgroundStyle,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY, surfaceColors,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT,
  buildSlidingPanels,
  CURRENT_VIEW_STORAGE_KEY, readCurrentView, writeCurrentView,
  useBoardContentOrder,
} from "./boardConfig";

// True only for the embedded copy of this same app the Settings page
// (SettingsPage.jsx) renders in an iframe as its live preview — never for
// a real board tab, even one opened by typing the URL directly, since
// nobody types "?preview=1" by hand. Gates every preview-only behavior
// below: restoring the teacher's actual current lesson on load, following
// it live as they navigate in the real tab, and accepting the highlight-
// region messages Settings sends when a category is selected. A real
// board tab never reads or writes anything preview-related.
const isPreviewMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";

// True only for the embedded copy of this same app the Build page
// (BuildPage.jsx) renders in an iframe as its live, editable preview —
// same idea as isPreviewMode above, but this copy is fully interactive
// rather than a read-only mockup. Gates every inline "+ Add ..." tile and
// every hover-reveal "Change"/"Remove" control below: true only inside
// that embedded copy, so a real board tab (which can be projected in
// front of a class) never shows any of them, no matter which teacher
// identity is active.
const isBuildMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("build") === "1";

// Deep-link params a plain real board tab honors on load: `?unit=<idx>&
// lesson=<title>`. This is what lets Build's "← Back to board" link (see
// BuildPage.jsx) return the teacher to the exact lesson they were editing
// instead of always resetting to the homepage — Build tracks its own
// current unit/lesson (reported up via postMessage, see the "homeroom-
// build-current-view" effect below) and builds its back-link href with
// these params. A plain "/" with neither param still starts at the
// homepage exactly as before; this only kicks in when a caller actually
// asks for a specific lesson.
function readViewFromUrlParams() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const unitParam = params.get("unit");
  if (unitParam == null) return null;
  const unitIdx = Number(unitParam);
  if (!Number.isInteger(unitIdx) || unitIdx < 0) return null;
  const lessonTitle = params.get("lesson") || null;
  return { unitIdx, lessonTitle };
}

const THUMB = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w400`;

// Video library — lesson videos are entered manually in the curriculum data
// (a `videos: [{ title, id }]` array per lesson, same pattern as
// `assignments`), no YouTube API/backend needed. `id` accepts either a bare
// video ID or a full YouTube URL — this pulls the ID out of the common URL
// shapes so pasting a link straight from the address bar just works.
function extractYouTubeId(input) {
  if (!input) return null;
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match ? match[1] : input;
}
const youtubeThumb = (id) => `https://img.youtube.com/vi/${extractYouTubeId(id)}/hqdefault.jpg`;
const youtubeEmbed = (id) => `https://www.youtube.com/embed/${extractYouTubeId(id)}?autoplay=1`;

// Spacing scale — sized a step looser than typical web UI since this is read
// from across a classroom on a projected/flat-panel display, not up close.
// Structural elements (board border, bulletin strip height, chalk ledge) are
// intentionally NOT on this scale — those are physical proportions, not content rhythm.
const SPACE = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 };

// Board arrangement, bulletin, board content, and wall/background presets
// all now live in ./boardConfig.js — shared with the new Settings page
// (SettingsPage.jsx), which opens in its own browser tab and needs the
// same preset definitions and storage keys.

// buildSlidingPanels now lives in ./boardConfig.js, shared with
// FullAgendaBoard.jsx (its Objectives & Benchmarks checklist supports
// Sliding Boards too, not just the Simple Goals content template).

// Quick-launch tools footer — same tools Jay's students use in class, one click away.
const FOOTER_LINKS = [
  { label: "Drive", href: "https://drive.google.com/", icon: "/logos/drive.png" },
  { label: "Gmail", href: "https://mail.google.com/", icon: "/logos/gmail.png" },
  { label: "EdPuzzle", href: "https://edpuzzle.com/", icon: "/logos/edpuzzle.png" },
  { label: "YouTube", href: "https://www.youtube.com/", icon: "/logos/youtube.png" },
  { label: "Kahoot!", href: "https://kahoot.com/", icon: "/logos/kahoot.png" },
  { label: "Clever", href: "https://clever.com/", icon: "/logos/clever.png" },
  { label: "Canvas", href: "https://wgsd.instructure.com/", icon: "/logos/canvas.png" },
  { label: "WGHS", href: "https://www.webster.k12.mo.us/wghs", icon: "/logos/wghs.png" },
];

function ToolsFooter() {
  return (
    <div style={{ background: "var(--board-primary)", borderTop: "4px solid var(--board-secondary)", padding: `${SPACE.md}px ${SPACE.lg}px`, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: SPACE.md, flexShrink: 0 }}>
      {FOOTER_LINKS.map((t, i) => (
        <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" title={t.label}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, background: "transparent", borderRadius: 10, padding: 6, transition: "transform 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          <img src={t.icon} alt={t.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </a>
      ))}
    </div>
  );
}

export const curriculum = [
  {
    unit: "Unit 1",
    title: "Unit 1 — Matter & Measurement",
    overview: [
      "Lab Basics",
      "Scientific Measurement",
      "Labs",
    ],
    lessons: [
      {
        title: "Lab Basics",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vRUYsT5bi-Ks4gk9i7Ef-fW3QxkbaRLxLFRpVbf7toOUXtqWJamVY9NPWlQIi7U2V9RCC9sEUhrz2Sz/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify key lab safety rules.",
          "I will be able to locate safety equipment in the lab.",
          "I will be able to distinguish between accuracy and precision.",
          "I will be able to calculate percent error.",
        ],
        assignments: [
          { label: "Science Student Safety Contract", url: "https://kami.app/WWY-kkP-eA6-WHM", thumb: THUMB("18-GHcI5-9fb8RNA5BMURr8OCGBrB6aQ6") },
          { label: "POGIL — Student Safety", url: "https://kami.app/55C-MEv-uVD-gzG", thumb: THUMB("1qWJWOoFyYyiumNbW8Gq8qLYOxhDUpsn3") },
          { label: "POGIL — Accuracy and Precision", url: "https://kami.app/XJ2-Q6N-sW3-EHa", thumb: THUMB("1CLKsC3jLT1sdN3dBzh3AoJ000-oWo4ML") },
          { label: "Lab Safety Escape Room", url: "https://docs.google.com/presentation/d/1calYU0qUiI3dMs7ki-oSraAZ52P3TXAmv2amGeuhvPw/edit", thumb: THUMB("1w6FYXKAP5s9uT4j2qzT6YEZ_NrXf_Ivj") },
        ],
        videos: [
          { title: "General Lab Safety", id: "MEIXRLcC6RA" },
          { title: "Top 10 Rules of Science Lab Safety", id: "s6lOQ5_Vlok" },
          { title: "Lab Techniques & Safety: Crash Course Chemistry #21", id: "VRWRmIEHr3A" },
          { title: "Accuracy and Precision and the Percent Error Equation", id: "vMNflBQFNaw" },
          { title: "Precision, Accuracy & Significant Figures in Chemistry", id: "tuzJtpC_P_4" },
          { title: "Accuracy and Precision with Percent Error and Percent Deviation", id: "loduc50moIQ" },
        ],
      },
      {
        title: "Scientific Measurement",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vSLNTgxmHxGwaF0HF4TQm7SUAeC7O5UIwzDHvld82GF0PQeVtZhgv9XDC6XwLHeLsZouOmpDbm2pjqF/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to convert numbers between decimal and scientific notation.",
          "I will be able to convert between metric units of measurement.",
          "I will be able to apply significant figures rules to measurements and calculations.",
        ],
        assignments: [
          { label: "POGIL — Numbers for Nerds", url: "https://kami.app/utL-fgR-m8S-9g1", thumb: THUMB("1k3N49ZqBhycJxyiAHRkDz8SRBsxZenuS") },
          { label: "Notes — Scientific Notation & Metric System", url: "https://drive.google.com/file/d/14dCvHJeY6rOfdOhCpYHF8gPfki8DaqQK/view", thumb: THUMB("1F7JgvMdVIdnhCx-MbD7wKFO_XdgnIXwf") },
          { label: "Metric Unit Conversion Visual", url: "https://drive.google.com/file/d/1FJHKRGQ1uEdKYdR_y4Kmjgzcgt6_9DHL/view", thumb: THUMB("1FJHKRGQ1uEdKYdR_y4Kmjgzcgt6_9DHL") },
          { label: "POGIL — Revenge of the Nerds", url: "https://docs.google.com/document/d/1IpstkFfaOCg7Pg3sDqmamzafygyeQ2Kyotjd3VvXYPs/edit", thumb: THUMB("1tHeHlwOOrGN8JETLuEpl4a2_xwwCz-g1") },
          { label: "POGIL — Significant Digits and Measurement", url: "https://docs.google.com/document/d/1VQqBib-1ya5cJp4_MS1wFSzwXNIraOXDsau5uY3985g/edit" , thumb: THUMB("1EKI6MX1h3YBk43fgsNMOKsXEcopieY9w") },
        ],
        videos: [
          { title: "Unit Conversion & Significant Figures: Crash Course Chemistry #2", id: "hQpQ0hxVNTg" },
          { title: "Learn Unit Conversions, Metric System & Scientific Notation", id: "W_SMypXo7tc" },
          { title: "Significant Figures, Measurement in Science, and Scientific Notation", id: "btXoAPefDlM" },
          { title: "Scientific Notation, Metric Prefixes, and Conversion Factors", id: "1tEbgdmwoKM" },
          { title: "Significant Figures Made Easy!", id: "9WFxkxFXb20" },
          { title: "Significant Figures and Unit Conversions", id: "izgHBIEWfKY" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to make qualitative and quantitative observations during a lab.",
          "I will be able to safely operate lab equipment, including a Bunsen burner.",
          "I will be able to identify physical and chemical properties of matter.",
          "I will be able to calculate density and percent error from experimental data.",
        ],
        assignments: [
          { label: "Lab 1.0 — Chemistry in a Bag", url: "https://kami.app/as2-4fQ-uvn-FaL", thumb: THUMB("18OZJ6leDveIk9SAFLQl12Q3Z4YCoR4g2") },
          { label: "Lab 1A — Observations and Properties", url: "https://kami.app/wDm-NEd-XX8-pnD", thumb: THUMB("1ai2X_EX1gmBuhO9Lka9FbXFlEaj3s9Df") },
          { label: "Lab 1B — Bunsen Burner Lab", url: "https://kami.app/bBB-xTH-Jur-ibZ", thumb: THUMB("12EY6IEUDVmB1nQ_U5TmBBpbXSw0zrLiB") },
          { label: "Lab 1C — Candle Experiment", url: "https://kami.app/BTu-Kxz-trE-k9d", thumb: THUMB("1hFdz0o2YfS10sUwgeQa_bk_xnllzRAwz") },
          { label: "Lab 1D — Quantitative Observations in Chemistry", url: "https://kami.app/cEA-dwB-KcJ-tm4", thumb: THUMB("1OZfHXtSSzalZHNy3RHDMKdGGAr82LXyi") },
        ],
      },
    ],
  },
  {
    unit: "Unit 2",
    title: "Unit 2 — Classification of Matter",
    overview: [
      "Classification of Matter",
      "Physical vs. Chemical Change",
      "Labs",
    ],
    lessons: [
      {
        title: "Classification of Matter",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vRRiPlYui1CKiBWlxRyXy8p4yE0Iq8hRQ5UwIyecuWVPked0R675vMeuNWneU8G_IxHvHwonezuFqsH/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to classify a sample of matter as an element, compound, or mixture.",
          "I will be able to distinguish between homogeneous and heterogeneous mixtures.",
          "I will be able to use classification of matter vocabulary correctly in context.",
          "I will be able to organize classification-of-matter concepts into a concept map.",
        ],
        assignments: [
          { label: "Nuts and Bolts Worksheet", url: "https://kami.app/Prk-LmD-4SR-6EC", thumb: THUMB("1fJrkHQ8OQ3IMLlcAXN8IX6Z3jbxJqV6Q") },
          { label: "Compounds and Mixtures Worksheet", url: "https://kami.app/JP4-3ZW-Aet-Rxx", thumb: THUMB("1hfFSrsAdt6vhZpPTsdzc53Owwdke4661") },
          { label: "Chemistry Vocabulary Worksheet", url: "https://kami.app/MBW-WYr-4pt-vSC" , thumb: THUMB("1z35eB2eAOSCoPVslvyPApLXX2dLGek0D") },
          { label: "Chemistry Vocabulary 2", url: "https://kami.app/TXj-1w1-F49-gut" , thumb: THUMB("1AvCsqtJ2LUnsFDEAr38mk_LV9iAOzoFe") },
          { label: "Concept Map — Element and Mixture", url: "https://kami.app/wsB-pYp-tQK-B5z" , thumb: THUMB("1lu4vdCwxwnVTFOX_7b9R0qdI8AGka8kw") },
          { label: "Concept Map Template", url: "https://kami.app/b2E-xRQ-V7J-qtC" , thumb: THUMB("1lu4vdCwxwnVTFOX_7b9R0qdI8AGka8kw") },
        ],
        videos: [
          { title: "Types of Matter: Mixtures, Elements, & Compounds", id: "EXIBrrUBaz4" },
          { title: "Homogeneous and Heterogeneous Mixtures Examples", id: "eI-tmv4DLEk" },
          { title: "Classifying Matter: Elements, Compounds, Mixtures", id: "IK6EgLdnWIU" },
          { title: "Elements, Compounds, and Mixtures: How to Classify Matter", id: "gVNQkbkssZ4" },
          { title: "Types of Matter - Elements, Compounds, Mixtures, and Pure Substances", id: "SSKvnWYbrwM" },
          { title: "Classifying Matter - Elements, Compounds & Mixtures", id: "rEDjDCzYPuA" },
        ],
      },
      {
        title: "Physical vs. Chemical Change",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vS0Cpf089tONQXPWc8dj2eJL-guqTSG0E_bWuqmHh3LuVdEZEg3ZFYaIYnteIHMYW0eJzcp7jsTyyho/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify evidence of a chemical change.",
          "I will be able to distinguish between physical and chemical properties.",
          "I will be able to classify changes in matter as physical or chemical.",
        ],
        assignments: [
          { label: "Chemical vs. Physical Change Lab", url: "https://kami.app/mPp-yvW-3LG-E6y", thumb: THUMB("1jZEyMJi-bgNzwNZoqXPvarFrGmF68-v4") },
          { label: "Lab — Physical vs. Chemical Changes (alt)", url: "https://kami.app/WQN-KEV-5Hd-nwe" , thumb: THUMB("1CT0MtBkZKwpQ4GXXXRRt5zq19cHB_Lsz") },
        ],
        videos: [
          { title: "Physical Vs. Chemical Changes - Explained", id: "4ZGULLWEy1c" },
          { title: "Physical and chemical changes | Khan Academy", id: "n5cZ5CWuUJA" },
          { title: "Physical & Chemical Properties, Physical & Chemical Changes", id: "Kdk8rIUW1xU" },
          { title: "Physical vs. Chemical Changes: How to Tell the Difference (4 Easy Clues)", id: "qllh0__-J8s" },
          { title: "Physical Change vs. Chemical Change (ft. mini quiz)", id: "V1Tt-kQPhKk" },
          { title: "Physical vs Chemical Changes", id: "k57xIG67rAA" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to separate mixtures into their components using physical methods (chromatography, distillation, evaporation).",
          "I will be able to record and interpret qualitative and quantitative lab observations.",
          "I will be able to identify signs that a chemical reaction has taken place.",
          "I will be able to safely use lab equipment, including a Bunsen burner, during separation and reaction labs.",
        ],
        assignments: [
          { label: "Lab 2.0 — Mixtures Paper Chromatography", url: "https://kami.app/J4b-MKg-pnh-bPv", thumb: THUMB("1GMCRHhx352LT01gAbScrrTV2j4F1p5a-") },
          { label: "Lab 2.1 — Mixtures Lab", url: "https://kami.app/qNJ-Ydx-P8T-acM", thumb: THUMB("1F5rSvqbWcnjuoEK5itmSqihprIikDP8w") },
          { label: "Distillation Lab", url: "https://kami.app/pp9-W2Z-EGg-KXL", thumb: THUMB("1x2zGlXVEHy1W9pBmlDHyOornyCEtQenA") },
          { label: "Evaporation and Bunsen Burner Lab", url: "https://kami.app/FyN-ZPe-PFH-rs5", thumb: THUMB("1YOeeIkBNFG9y6vN1k1-agsaKtXo5SMcv") },
          { label: "Observing a Chemical Reaction", url: "https://kami.app/AQQ-TYx-P3z-pCn" , thumb: THUMB("1mawhs62Ak3QpdGyu6fT_MgQTVcpK9lMT") },
        ],
      },
    ],
  },
  {
    unit: "Unit 3",
    title: "Unit 3 — Atomic Structure",
    overview: ["Atomic Structure", "Atomic Theory", "Ions", "Isotopes", "Labs"],
    lessons: [
      {
        title: "Atomic Structure",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vRI1y8L-6ovJVANVplX1QCKVRU1EV-xFaa_JFR9rB5_-RF7r0jfpogpBwcn46lF4a3SC7k5TQsb7YGF/pubembed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify the subatomic particles that make up an atom.",
          "I will be able to describe the structure of an atom.",
          "I will be able to model atomic structure using a diagram.",
        ],
        assignments: [
          { label: "Atom Diagram — Sidewalk Chalk Practice", url: "https://docs.google.com/document/d/1CSN8c-i9W5o-STwuRydBmrpZfct3tFXIbGwuZ_xwyLo/edit", thumb: THUMB("15uM5LI4VUnPzdYLIPXk1nvwwSrMLNP8T") },
        ],
        videos: [
          { title: "Structure of the Atom - Subatomic Particles", id: "g6FXlee_wHc" },
          { title: "Protons, neutrons, and electrons in atoms | Khan Academy", id: "lz_gMkQr7YE" },
          { title: "Atomic Structure: Subatomic Particles (Protons, Neutrons, & Electrons)", id: "KUVG4qD7lDo" },
          { title: "Protons, Neutrons, and Electrons (Intro to Subatomic Particles!)", id: "QRdkQ6SFhQw" },
          { title: "Atomic Structure: Protons, Electrons & Neutrons", id: "EMDrb2LqL7E" },
          { title: "Atomic Structure Basics: Protons, Neutrons and Electrons and Reading the Periodic Table", id: "IAeMiOjO2f0" },
        ],
      },
      {
        title: "Atomic Theory",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vRHp-fOmSJeumYdH3qUIQpJGCNKybreml36JpxYZwS6kYmbdd7yrl7Qck8srGDkavAxqxUOnrPznMkG/pubembed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to describe the historical development of atomic theory.",
          "I will be able to explain the contributions of major scientists to atomic theory.",
          "I will be able to summarize the modern atomic model.",
        ],
        assignments: [
        ],
        videos: [
          { title: "Chemistry & Physics: History of the Atom (Dalton, Thomson, Rutherford, and Bohr Models)", id: "-4Us5PTb4J8" },
          { title: "Early Atomic Theory Explained: Dalton, Thomson, Rutherford & Millikan", id: "Z8FnIQfyu0M" },
          { title: "The History of Atomic Theories | Dalton | Thomson | Rutherford | Bohr", id: "NUbs5MCty9M" },
          { title: "What Are The Different Atomic Models? Dalton, Rutherford, Bohr and Heisenberg", id: "v48u8hjqNBU" },
          { title: "Early Atomic Theory: Dalton, Thomson, Rutherford and Millikan", id: "UDIprICe9kg" },
          { title: "Atomic Theory | John Dalton | J.J. Thomson | Ernest Rutherford | Niels Bohr", id: "UIvaNirdavY" },
        ],
      },
      {
        title: "Ions",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vTznde9XH-_9UVl4YbF7ULV8r9fbBXVzh9O6BiUCjswH5DUHhzn7RhcT1naXH3bO5CJCJrFjmegaB9F/pubembed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to determine the charge of an ion based on gained or lost electrons.",
          "I will be able to distinguish between cations and anions.",
          "I will be able to write the symbol for an ion.",
        ],
        assignments: [
          { label: "POGIL — Ions", url: "https://docs.google.com/document/d/1H5zGot6adEIPZU2Mq8N7Ttk86onEDMZTYTATMehY7yI/edit", thumb: THUMB("120Zjgo5q5JKAcQWcu3uKXaoT2jo_qK-y") },
        ],
        videos: [
          { title: "What Are Ions? | Cations and Anions Explained", id: "xDj_lfM2ZRA" },
          { title: "Introduction to Ions | Khan Academy", id: "zTUnjPALX_U" },
          { title: "Ions Explained - Cations, Anions, Polyatomic Ions", id: "cAeHHhPhbcc" },
          { title: "Atoms, Molecules, and Ions: What are Cations and Anions?", id: "A0PnEYo3JX8" },
          { title: "IONS EXPLAINED: How Ions Form (Cations vs Anions)", id: "ME16VVASTq0" },
          { title: "Chemistry Revision - Ions (Cation, Anion, Bonds)", id: "sa508x9xtUA" },
        ],
      },
      {
        title: "Isotopes",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vRziU6JlRjEnwmqdvh-E96t3-oiX8XUH5IFVgUp5cxYv-i3hdJ5vSZBYUR8oE-Vx-ZgJT4kBWiQ2YDO/pubembed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to explain what makes atoms isotopes of the same element.",
          "I will be able to calculate the number of neutrons in an isotope.",
          "I will be able to calculate average atomic mass from isotope data.",
        ],
        assignments: [
          { label: "POGIL — Isotopes", url: "https://docs.google.com/document/d/1Qi1dAuXEcDPamO9Cf2XCP7Sl03WzSUrkMFJT0mpma_A/edit", thumb: THUMB("1D6gMBZoMdtX7iUOetAMKIsIS5-hjtRrg") },
        ],
        videos: [
          { title: "Average Atomic Mass Practice Problems", id: "rgixSP7PxS0" },
          { title: "How To Calculate The Average Atomic Mass", id: "JT18bDAadQ0" },
          { title: "Isotopes Part 2: Calculating Average Atomic Mass", id: "qZEKmKCWUNw" },
          { title: "Calculate the Average Atomic Mass From Isotopes", id: "kIvfX-PqkzI" },
          { title: "Calculating Atomic Mass Using Isotopes", id: "Aby7CYJJDOw" },
          { title: "Isotopes, Percent Abundance, Atomic Mass | How to Pass Chemistry", id: "ZtKuHxJXH6I" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to build a model atom given its atomic number and mass number.",
          "I will be able to determine the identity of an isotope from experimental data.",
          "I will be able to identify elements based on flame test results.",
        ],
        assignments: [
          { label: "PhET — Build an Atom", url: "https://kami.app/6rz-WUg-pz6-qLp", thumb: THUMB("1mYl3AWYv1WU5pQQo4YMZwyBISvtDcjDM") },
          { label: "Lab — Atomic Mass and Isotopes", url: "https://kami.app/td6-9KT-Nmj-sWC", thumb: THUMB("10RjTBIY7_WfZyGvzmrG8xOeha3V1bGRb") },
          { label: "Lab — Flame Test", url: "https://kami.app/xxh-u8c-Bg5-GR4", thumb: THUMB("1wP62bM0LWYzsp6o7Vd_RRvblmojINIAq") },
        ],
      },
    ],
  },
  {
    unit: "Unit 4",
    title: "Unit 4 — Periodic Table",
    overview: ["Electron Configuration", "Lewis Dot Structures", "Periodic Trends", "Element Families", "Labs"],
    lessons: [
      {
        title: "Electron Configuration",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vSdXS06Q7qC8BFmqYnCNvRTk2Grm26DYshRGlFztAo8QPdNuazF0KuWd93QM52QcybYj1wd_6GGM1SI/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to write the electron configuration for a given element.",
          "I will be able to determine the number of valence electrons for an element using the periodic table.",
          "I will be able to write noble gas (shorthand) electron configurations.",
        ],
        assignments: [
          { label: "Using the Periodic Table to Determine Valence Electrons", url: "https://kami.app/ruh-FPb-vgL-KAN", thumb: THUMB("1z8vnVllyRxZVfMoMrIXZQ9MOaogexBh0") },
          { label: "Periodic Table Activity", url: "https://kami.app/pWd-SSN-izs-zTm", thumb: THUMB("1HZ6DLeNspuqIA7GPonZQJ29yOEdJlhKX") },
          { label: "Electron Energy Levels and Sublevels", url: "https://kami.app/GA9-7XZ-p4u-N4k", thumb: THUMB("1MrbwRHqFgeqKYCCQgxVLrlX_74GGGdfR") },
          { label: "Noble Gas Electron Configuration", url: "https://kami.app/EWf-dyg-WKS-5jT", thumb: THUMB("17wDiMn2k_vfFINOSncVFQe86uaCyh783") },
          { label: "Build Up Process for Determining Orbitals of Electrons", url: "https://kami.app/RfH-KtR-DYy-fFK", thumb: THUMB("1se_wRO58cBmvMBlH4hsduLckMXhNvbhl") },
        ],
        videos: [
          { title: "Electron Configuration With Noble Gas Notation", id: "6MAKMnZdfbs" },
          { title: "How to Write Electron Configuration (Full & Noble Gas Notation)", id: "LdeYIjQP6vs" },
          { title: "How to Write Noble Gas Electron Configuration", id: "48ifv5QHXuQ" },
          { title: "Noble Gas Electron Configuration Made Easy", id: "xbYlMtSVAmI" },
          { title: "Shorthand Notation of Electron Configurations", id: "T8KZnI1v4X4" },
          { title: "Abbreviated Electron Configurations", id: "Ysc8eUgOMp0" },
        ],
      },
      {
        title: "Lewis Dot Structures",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vS136_1qNt3nn0UMVX4JOzBhXnwjKGXNQvlE6LmIAn-cRVjq72J0DnaMhzK0j6t4LcWiyPblRWDCum7/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to draw the Lewis dot structure for an atom based on its valence electrons.",
          "I will be able to relate electron energy levels to an atom's Lewis dot structure.",
        ],
        assignments: [
          { label: "Electron Energy Levels Mapping", url: "https://kami.app/sBh-SWr-K3J-8UR", thumb: THUMB("1umvAg-dnbhjo0RMpFE-pWlltfh_o-5Vy") },
        ],
        videos: [
          { title: "How To Draw Lewis Dot Diagrams: Easy Chemistry Guide to Valence Electrons", id: "BXWALYoprEY" },
          { title: "Valence Electrons and Lewis Dot Structures", id: "hm3WUFaXwtA" },
          { title: "Lewis Dot Diagrams", id: "cnHYtjioC4s" },
          { title: "Lewis Dot Structures of Atoms", id: "LmRM76Fe0uI" },
          { title: "Valence Electrons Explained in 5 Minutes", id: "ov2ZHoXIBF0" },
          { title: "Lewis Dot Structures of Covalent Compounds", id: "KLOGiTtrcWk" },
        ],
      },
      {
        title: "Periodic Trends",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vTJf2vsG6b6XcWwd1B-r_c7ODXqQr4n3laGJPxD-P1f0rdp4jeGwuc5FRz1R_b9lzNbUoSK9rbizCQC/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to describe and explain trends in atomic radius across the periodic table.",
          "I will be able to describe and explain trends in ionization energy and electronegativity.",
          "I will be able to use the periodic table to predict relative properties of elements.",
        ],
        assignments: [
          { label: "Trends Table", url: "https://kami.app/wEJ-mcS-M3P-wPW", thumb: THUMB("1Ze1Jv8-HkV8YJD1AxBPERtJFjPz5DFC3") },
          { label: "POGIL — The Trendy Periodic Table", url: "https://kami.app/SqX-eaS-X8U-Fex", thumb: THUMB("1rLYKCttLjmvmFK2tp17_IlC1dhzoCAam") },
          { label: "Paint Chip POGIL", url: "https://kami.app/2Nw-48y-EGa-3VC", thumb: THUMB("1v6nfvIGZVQKEekHvyaM5-6PxznvQr3tj") },
          { label: "Trends of the Periodic Table — Graphing", url: "https://kami.app/KJQ-FB1-p1C-2m9", thumb: THUMB("1GmpkQGgtfnTGCy357CIMBwRXR6oaDmXX") },
          { label: "Trends of the Periodic Table", url: "https://kami.app/9VT-eQZ-dB3-teh", thumb: THUMB("17quNsqYrk4LnCO0Y60qlsLIK0riIzFPB") },
          { label: "Homework Check — Trends of the Periodic Table", url: "https://kami.app/r14-a8S-PcV-vxj", thumb: THUMB("181EZrVZMsVNaoGzV_2-2tXVmfOrPHxfo") },
        ],
        videos: [
          { title: "Periodic Trends - Atomic/Ionic Radius, Ionization Energy, Electronegativity, Metallic Character", id: "BH4kUx_lT0M" },
          { title: "Periodic Trends: Electronegativity, Ionization Energy, Atomic Radius", id: "0h8q1GIQ-H4" },
          { title: "Ionization Energy, Electron Affinity, Atomic Radius, Ionic Radii, Electronegativity, Metal Character", id: "Gy9HR65DpYQ" },
          { title: "Periodic Trends: Electronegativity, Ionization Energy, Atomic Radius, and Electron Affinity", id: "E0YdrosU0lk" },
          { title: "Periodic Trends - Atomic Radius, Electronegativity, Ionization Energy", id: "7cEtOHLZQ2A" },
          { title: "Periodic Table of Elements - Trends (Atomic Size, Ionization Energy, Electronegativity, Ion Size)", id: "vXch_c1e77U" },
        ],
      },
      {
        title: "Element Families",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vRhwyUwWm1Ur6KnY9fCqcQyxAMzgNtq2qsFM3J1GEkIPdYXZwZiaJ_eTUW-i7XqMABA1SinRMBapoF5/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify element families/groups on the periodic table and their shared properties.",
          "I will be able to research and present information about a specific element.",
        ],
        assignments: [
          { label: "Element Project", url: "https://kami.app/DeT-pdb-yUD-Dnm", thumb: THUMB("1L-N2Tfrfb5oHX-2qV7gHbALksR2JVO9B") },
          { label: "Element Square Gallery Walk", url: "https://kami.app/YSz-4D3-d6Q-bg5", thumb: THUMB("1q3TgDAhD7uQuJIfTx-ZRg1ER4gXQqgTW") },
          { label: "Foldable — Periodic Table", url: "https://kami.app/jhB-GiU-ptr-3uA", thumb: THUMB("19Yf3SKFgiPFnQ2L0U8YckPbUQX5KhhT8") },
          { label: "Element Jigsaw", url: "https://kami.app/jfY-H5E-F8V-h8g", thumb: THUMB("1P2Ts8M2IfCYRRBGbyczI0q_UE_epO2bG") },
          { label: "Element Jigsaw — 45 Questions", url: "https://kami.app/hMt-pCh-Dh5-nsf", thumb: THUMB("1dv0sRj1YdGRY-NQWwVLLWCQ6jDAAHEYQ") },
        ],
        videos: [
          { title: "The 8 Groups of the Periodic Table", id: "6-7nS3vjqMg" },
          { title: "Groups of the Periodic Table | Khan Academy", id: "LDHg7Vgzses" },
          { title: "Groups of the Periodic Table: Alkali Metals, Alkaline Metals, Halogens, & Noble Gases", id: "v1GyV43H2uI" },
          { title: "Periodic Table Families | Learn Easily with Desserts", id: "So-KCcsh4GE" },
          { title: "Families of the Periodic Table", id: "gFfug4V_-sw" },
          { title: "All Families In The Periodic Table Explained!", id: "roYiPCcMnzc" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to observe and record properties of alkaline earth metals through a lab investigation.",
          "I will be able to relate observed lab properties to periodic trends.",
        ],
        assignments: [
          { label: "Lab — Alkaline Metals", url: "https://kami.app/wRx-fSV-825-6fZ", thumb: THUMB("1xdnl9gA8OrbcFUxLFZ5jxTiy8hHjSenW") },
        ],
      },
    ],
  },
  {
    unit: "Unit 5",
    title: "Unit 5 — Naming & Formulas",
    overview: ["Chemical Formulas", "Naming Ionic Compounds", "Labs"],
    lessons: [
      {
        title: "Chemical Formulas",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vRjA63m58vjezymAZNDMyEmVSeX03egixKj2QvFgPfCUKUPYmplqg3-dLA1JANPOWuPXH9icbulbusz/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to write chemical formulas for covalent compounds.",
          "I will be able to name covalent compounds using prefixes.",
          "I will be able to apply formula-writing rules to practice problems.",
        ],
        assignments: [
          { label: "POGIL — Formulas and Naming", url: "https://kami.app/FFC-z52-56y-kLX", thumb: THUMB("1bW0ugwD5kEoZsYByvvNlsFBIaF_-VrRd") },
          { label: "Chemistry Dice", url: "https://kami.app/mCL-svh-5Ew-fs9", thumb: THUMB("1tucJaaZVeVePJqxuV8BN1MttpVuLfLeH") },
          { label: "Chemical Formula Practice 1.3", url: "https://kami.app/77y-YcS-vTE-SrS", thumb: THUMB("1pQtsdjM2Vw65a4C-SQJVyCahR2xq54af") },
          { label: "Chemical Formula Practice 1", url: "https://kami.app/tAG-GkP-PzE-f7J", thumb: THUMB("1CrvSMXj4T5-ALWAuehAKw8Ngm3Scinik") },
        ],
        videos: [
          { title: "Writing Chemical Formulas For Ionic Compounds", id: "GJ4Mds0CWLE" },
          { title: "Writing Formulas for Ionic Compounds", id: "RKbPc-QkMC0" },
          { title: "Writing Ionic Formulas - Basic Introduction", id: "jJUO0Vqd3QE" },
          { title: "Writing Ionic Compounds Formulas | Fast & Easy Way | Practice Examples", id: "xAJQr5Owa68" },
          { title: "Writing Ionic Formulas: Introduction", id: "URc75hoKGLY" },
          { title: "Writing Ionic Formulas: Practice Problems", id: "X_LVANMpJ0c" },
        ],
      },
      {
        title: "Naming Ionic Compounds",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vSafEEi6_IQRask7DU3lcrkTzu_YUuQ7KfBDGvxC3i6ro0mt7vkV8J0UVqQimYkghz99bNl0YhpTsPh/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to write chemical formulas for ionic compounds.",
          "I will be able to name ionic compounds, including those with polyatomic ions.",
        ],
        assignments: [
          { label: "POGIL — Naming Ionic Compounds", url: "https://kami.app/P5h-qx6-sp2-mru", thumb: THUMB("1WqGZm1fzDFz9ieOoTwwNYlQsgMo34cPm") },
          { label: "Chemical Formula Practice 1.2", url: "https://docs.google.com/document/d/1NBmr-aZP80ZDuQvibs2tK0eU7fILb3wbWlLCpCn1BI0/edit", thumb: THUMB("1pYBv2DSJwCkEH1ifHdszojNUaGAh3DEs") },
        ],
        videos: [
          { title: "Naming Compounds with Polyatomic Ions", id: "PPfLDdIfOVA" },
          { title: "How To Name Ionic Compounds With Transition Metals", id: "eM5mDnQX0k8" },
          { title: "Naming Ionic Compounds with Polyatomic Ions!", id: "LZsEiFDtdO4" },
          { title: "How to Name Ionic Compounds with Polyatomic Ions", id: "eTNSij-GVHk" },
          { title: "Compounds Containing Polyatomic Ions - Naming and Writing Chemical Formulas", id: "BT9XUoXKzmc" },
          { title: "Naming Ionic Compounds with Polyatomic Ions Examples & Practice Problems", id: "gt44MueXBso" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to observe and classify chemical reactions in a lab setting.",
          "I will be able to relate chemical formulas and naming to lab observations.",
        ],
        assignments: [
          { label: "Lab — Types of Chemical Reactions", url: "https://kami.app/pwh-3dQ-N1r-FcT", thumb: THUMB("1MXj2fWuLzQbFEJDkSOWXTJkKkeHKI8pb") },
          { label: "Lab — Chemical Change and Equations", url: "https://kami.app/9cA-pkw-4rM-z15", thumb: THUMB("1M2sLugNCZT49rAbqbtC62KqiAPGTU39P") },
        ],
      },
    ],
  },
  {
    unit: "Unit 6",
    title: "Unit 6 — Equations & Reactions",
    overview: ["Balancing Equations", "Types of Reactions", "Labs"],
    lessons: [
      {
        title: "Balancing Equations",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vT7gI1H8fKy3R_RCRwsV73eo9GGsmyD_u3lq2QDDD692f5X3IwRYPDVbJBkPpJYGKNrnFWPQwPp0Edb/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to balance chemical equations using coefficients.",
          "I will be able to apply the law of conservation of mass to balance equations.",
          "I will be able to translate word equations into balanced chemical equations.",
        ],
        assignments: [
          { label: "Balancing Chemical Equations 2", url: "https://kami.app/g1S-mbZ-qjk-kfw", thumb: THUMB("1DLkriGH6L14R91wto4Tg9CUhiJZXMQMY") },
          { label: "Balancing Equations PhET Lab", url: "https://kami.app/k67-Kva-nyc-KKV", thumb: THUMB("1G6PsZUeYS10I0jdK_xEciWmR_7Y3AK-F") },
          { label: "Balancing Equations Practice", url: "https://kami.app/ZGa-p2E-RVK-FQK", thumb: THUMB("12Vi_qcr4L51g1ns3uCQbOD68T1kaN1ty") },
          { label: "POGIL — Balancing Equations", url: "https://kami.app/SyJ-huH-7ne-9t2", thumb: THUMB("1__moV7RqRrDljNkRMqzW4M1uOA-5f8he") },
          { label: "Word Equations", url: "https://kami.app/Hpx-zZJ-t4X-fq7", thumb: THUMB("1w3_E_xQkS4jhgxLJb5bD3kF4XY3sGiTx") },
        ],
        videos: [
          { title: "Balancing Chemical Equations | Law of Conservation of Mass | Chemistry 101", id: "fBFETm36Tc4" },
          { title: "Balancing Chemical Equations: Conservation of Mass Explained for Beginners", id: "8bF82Zooaos" },
          { title: "Law of Conservation of Mass & Balancing Chemical Equation", id: "nJScfxbwXGw" },
          { title: "Law of Conservation of Mass (Balancing Reactions)", id: "SjOcBr_6xvE" },
          { title: "Law of Conservation of Mass & Balancing Chemical Equations", id: "DXW367itRiA" },
          { title: "How Do Balanced Equations Ensure Conservation of Mass?", id: "ZOlpH-3UfQU" },
        ],
      },
      {
        title: "Types of Reactions",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vR7Hir8345SRdnhDV1N0cloHujFOfqN_d-Xmxl3bAZRt0df1gr9lgr93bINj8RnO4pr0uWJeEz3enWu/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to classify a chemical reaction as synthesis, decomposition, single replacement, double replacement, or combustion.",
          "I will be able to predict the products of a chemical reaction based on its type.",
        ],
        assignments: [
          { label: "Equations Worksheet", url: "https://kami.app/g8W-3NG-PHJ-cLz", thumb: THUMB("1-s19NEUJ60kIalc4cyeSxMM8fUhMJ5gt") },
          { label: "Foldable — Types of Reactions", url: "https://kami.app/7f2-SMf-hXF-wWt", thumb: THUMB("17NqzUlpRJFbt14BxDEHpgc98hSu0mwy0") },
        ],
        videos: [
          { title: "Types of Chemical Reactions (Synthesis, Decomposition, Single & Double Replacement, Combustion)", id: "OYW4pJvs3AU" },
          { title: "Types of Reaction: Single Displacement, Double Displacement, Synthesis, Decomposition, Combustion", id: "eUs2__t--3s" },
          { title: "Classifying Types of Chemical Reactions Practice Problems", id: "2qX9MOQOmAM" },
          { title: "Chemical Reactions Types - Single vs Double Displacement, Combination, Decomposition & Combustion", id: "427ZnkhE1cQ" },
          { title: "Classifying and Balancing Single, Double Replacement, Synthesis & Decomposition", id: "WQv-mFXVskE" },
          { title: "Chemical Reactions - Combination, Decomposition, Combustion, Single & Double Displacement", id: "1IG7t3kheGk" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to observe and record evidence of chemical reactions.",
          "I will be able to classify reactions performed in lab based on their type.",
          "I will be able to apply conservation of mass to lab data.",
        ],
        assignments: [
          { label: "Chemical Changes & Equations Lab", url: "https://kami.app/R1y-Q1B-cuW-BpP", thumb: THUMB("1E28VBnN7bH-R1ybShwYkmhNMeItv8Zpl") },
          { label: "Chemical Reactions Lab", url: "https://kami.app/4Z1-ptr-73s-WeR", thumb: THUMB("1e7jNKvdJHgddJxuZQxUU7md4HhZXbNo2") },
          { label: "Chemical vs. Physical Changes in Matter Lab", url: "https://kami.app/kW4-qiq-S7F-YCx", thumb: THUMB("1uqbf9iSRmL73ESxpChkBecxn8yS8LmYS") },
          { label: "Conservation of Mass Lab", url: "https://kami.app/P1Q-yER-9zs-L5M", thumb: THUMB("126L57KG20r44coSjObgj-eVPnzdSn7Ld") },
          { label: "Cut Outs Lab", url: "https://kami.app/evG-eek-CCM-2kQ", thumb: THUMB("1bIXYmIn93nBtpZzGuws2P2mIUNahD76f") },
          { label: "Double Replacement Reaction Lab", url: "https://kami.app/PN5-ffe-QZs-yLC", thumb: THUMB("19uuMEJ_XtidXQvzlyNufuLvn96kBIg-Y") },
          { label: "Limiting Reactants Lab", url: "https://kami.app/KND-C3p-V4m-ZcN", thumb: THUMB("1dMSUfP6CyaBLQlJk2n4QWF4rXt4HfUt5") },
          { label: "Single Replacement Reaction Lab", url: "https://kami.app/Z9h-HMJ-KDX-HX7", thumb: THUMB("1f1pH86xLHUjL4DB1KeAQwk0bxiXpw6vh") },
          { label: "Synthesis Reactions Lab", url: "https://kami.app/RFW-Kfg-1Gu-cxA", thumb: THUMB("1KF0lyEdJGJV5coxKz7RTgqOAo3SBGZGA") },
          { label: "Types of Chemical Reactions Lab", url: "https://kami.app/pWf-M2r-tTP-UCX", thumb: THUMB("1mLEundfK_v86cn2DgPZLtQJwYCmd46qc") },
        ],
      },
    ],
  },
  {
    unit: "Unit 7",
    title: "Unit 7 — Stoichiometry",
              overview: ["Stoichiometry", "Dimensional Analysis", "Labs"],
    lessons: [
      {
        title: "Stoichiometry",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vS0Y0UUVGfIrgMRFZrswelu3hgIDeG9fOlFiUFiGrAtMeUbJy-w9RcFkgNzwS3SrHcJMU005WgsJTpz/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to convert between moles, mass, and number of particles.",
          "I will be able to calculate molar mass for a compound.",
          "I will be able to apply dimensional analysis to solve stoichiometry problems.",
        ],
        assignments: [
          { label: "More Mole Practice Problems", url: "https://kami.app/htv-a6V-cVR-qwT", thumb: THUMB("1m7oVBeX2KupSycwS38sjC7-zVuHT-Mrd") },
          { label: "Mole Practice Problems", url: "https://kami.app/YPe-cY8-xiT-Nup", thumb: THUMB("1A86BqcxNlJmN2rxhhW3wcTjNhlPVT3_w") },
          { label: "Mole Madness", url: "https://kami.app/R3r-rAK-C6Q-QkC", thumb: THUMB("1CE3SR8dlMf3cNp1ZcKX3H3lk3tRrnFyq") },
          { label: "Calculating the Mass of an Atom or Molecule", url: "https://kami.app/Mg7-HTe-YgL-V6d", thumb: THUMB("19z6uiVB_4UGVpWBRENmF16WdTg0t-HtW") },
          { label: "Intro to the Mole", url: "https://kami.app/dTN-uec-wH5-MfQ", thumb: THUMB("1NDY47bF_zI61eD9OzZU0ZCB10BRI1csL") },
          { label: "Mass, Mole, or Number of Particles", url: "https://kami.app/Nrj-DNw-1D9-uK9", thumb: THUMB("1SVenFmiyKKT4MPAdOkWc63wUmp3ShWZ3") },
          { label: "Molar Mass", url: "https://kami.app/SUX-uFa-PYy-Pcs", thumb: THUMB("1UNVYsv7a_2PrSO_TU3a42e5VpOs6mVuv") },
          { label: "Calculating with Scientific Notation", url: "https://kami.app/6BG-y6K-JjH-t2L", thumb: THUMB("1OSNyQmv7cw4PIDGtsAR9omFAGKbmDWQt") },
          { label: "POGIL — Mole", url: "https://kami.app/QyP-AYV-yYN-jdk", thumb: THUMB("1vztc2_lphV_dunIUZrFUApdprSXhdMkw") },
        ],
        videos: [
          { title: "Stoichiometry Basic Introduction, Mole to Mole, Grams to Grams, Mole Ratio Practice Problems", id: "7Cfq0ilw7ps" },
          { title: "Stoichiometry Mole to Mole Conversions - Molar Ratio Practice Problems", id: "3zmeVamEsWI" },
          { title: "Stoichiometry 4: Mole to Mass Stoichiometry (Mole to Grams)", id: "PAyADIBpclk" },
          { title: "Mass-Mass Stoichiometry", id: "3-rk3axcoYw" },
          { title: "Stoichiometry | Mole to Mole | Grams to Grams | Mole to Grams | Grams to Mole | Mole Ratio", id: "guuo5P9p-XU" },
          { title: "Stoichiometry: Mole to Mole and Mole to Mass Conversions", id: "nTuriINaT2I" },
        ],
      },
            {
                    title: "Dimensional Analysis",
                            slides: "https://docs.google.com/presentation/d/e/2PACX-1vQs1oUezLchahvMBJXLb4amlIuJI7Hzm0RmMOAikCUE37pY5YP1px8zsM_XDJ6oLaK_5QEuikygPlJ4/embed?start=false&loop=false&delayms=3000",
                                    goals: [
                                              "I will be able to convert between units using dimensional analysis (conversion factors).",
                                                        "I will be able to set up and solve multi-step unit conversion problems.",
                                                                  "I will be able to apply dimensional analysis to stoichiometry calculations.",
                                                                          ],
                                                                                  assignments: [
                                                                                                                { label: "Dimensional Analysis Paper Visual", url: "https://drive.google.com/file/d/1I8KUBx9h_qxPkhzz0nvF_mVQRX9vOlIg/view", thumb: THUMB("1I8KUBx9h_qxPkhzz0nvF_mVQRX9vOlIg") },
                                                                                                                        ],
        videos: [
          { title: "Unit Conversion & Dimensional Analysis | How to Pass Chemistry", id: "0W1e-dAnRrE" },
          { title: "Dimensional Analysis/Factor Label Method - Chemistry Tutorial", id: "DsTg1CeWchc" },
          { title: "Unit Conversion Using Dimensional Analysis Tutorial (Factor Label Method)", id: "cbPmLTIe4A4" },
          { title: "Dimensional Analysis for Chemistry Conversions: The 3 Step Method for Unit Factors", id: "9nFmrMuBmR8" },
          { title: "How to Use Dimensional Analysis to Convert Units", id: "ktxdJZmMJbY" },
          { title: "Dimensional Analysis: Converting Units with 3 Conversion Factors", id: "eKDePGWNAHo" },
        ],
                                                                                                                              },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to apply mole conversions to experimental lab data.",
          "I will be able to calculate molar mass from a lab measurement.",
        ],
        assignments: [
          { label: "Mole Lab", url: "https://kami.app/mcE-Cgg-aXE-Xnp", thumb: THUMB("1XYe4BIidJ-ZVSNMfudf0V6MRzRiKUHaL") },
          { label: "Lab — Molar Masses and Moles", url: "https://kami.app/5mk-wz8-PvZ-kPJ", thumb: THUMB("1HFObchjQRNS3Ae5CpuTsY7wVfhT-ZCLl") },
        ],
      },
    ],
  },
  {
    unit: "Unit 8",
    title: "Unit 8 — Bonding",
    overview: ["Chemical Bonding", "Ionic Bonding", "VSEPR Theory", "Labs"],
    lessons: [
      {
        title: "Chemical Bonding",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vTmWpXf7rM9odTapShV7XwtAceq3juyju9_WcNXs4ydTF51uHjJ3-5a7zMmsY3dn3qICmZbahxpp1c7/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to distinguish between ionic, covalent, and metallic bonds.",
          "I will be able to explain how atoms bond to achieve a stable electron configuration.",
        ],
        assignments: [
          { label: "POGIL — Bonding", url: "https://drive.google.com/file/d/1ZzhCXdln84_V_liZwBlsmoPxfZ0C9J0U/view", thumb: THUMB("1ZzhCXdln84_V_liZwBlsmoPxfZ0C9J0U") },
        ],
        videos: [
          { title: "Chemical Bonding Explained: Ionic, Covalent & Metallic", id: "YPUosyliWNo" },
          { title: "Types of Bonding (Ionic, Covalent, Metallic) - GCSE Chemistry Revision", id: "vUbUoyR6Log" },
          { title: "Chemical Bonding Explained (Ionic, Covalent, Metallic)", id: "7YZjhi0f1es" },
          { title: "8.1 Ionic, Covalent, and Metallic Bonding | High School Chemistry", id: "Ef9605V0wz8" },
          { title: "Chemical Bonding: Introduction to Covalent, Ionic, and Metallic Bonds!", id: "u_Y1sC58C7M" },
          { title: "Ionic, Covalent, and Metallic Bonds | Khan Academy", id: "ZnDbJx0R5Eg" },
        ],
      },
      {
        title: "Ionic Bonding",
        slides: "",
        goals: [
          "I will be able to determine the charge of common cations and anions.",
          "I will be able to write and name formulas for ionic compounds.",
          "I will be able to explain how electronegativity relates to bond type.",
        ],
        assignments: [
          { label: "Types of Chemical Compounds and Bonding", url: "https://kami.app/nvE-NF2-1Va-xDr", thumb: THUMB("1pio2tDiNSM6BU-Wzjkm2we1ohmIJYiir") },
          { label: "Electronegativity and Bond Types Practice", url: "https://kami.app/Mv9-5Hu-Grg-T8b", thumb: THUMB("1NBQKjnP-5tYpG5fP0JS42EQvMrs0C05x") },
          { label: "Compound Type and Number of Atoms in a Formula", url: "https://kami.app/sHJ-uw7-8LL-7Bw", thumb: THUMB("1kEY4aQOsqeXLJUThH3JO0rINWxFTJml7") },
          { label: "Compounds Worksheet", url: "https://kami.app/Rz3-DJ8-4vQ-e1G", thumb: THUMB("1jn-RU8VTtQ-dg0mh_hNZNiiCDnvA8qqE") },
          { label: "Questions — Simple Ions", url: "https://kami.app/3iB-qYy-aey-PGy", thumb: THUMB("1fXibu5LU44UbqPm26hbwwifNKT5eZVj7") },
          { label: "Formation of Ionic Compounds Worksheet", url: "https://kami.app/b4R-VD1-6Fy-6hJ", thumb: THUMB("1ipPvfMVzsAteA74SodNmwdYHu1oYhPo_") },
          { label: "Formation of Compounds Worksheet", url: "https://kami.app/4NX-r7K-wFB-M3R", thumb: THUMB("18P34qyPrWNYjBhpK94dTrBkp7-kZTq_5") },
          { label: "Writing Formulas for Ionic Compounds", url: "https://kami.app/mLA-wVq-Sf3-UUJ", thumb: THUMB("1bNwP8Kse0tfYXCfhdw02hBpg8xbSNOz3") },
          { label: "Determining the Charge of Cations and Anions", url: "https://kami.app/PkH-Gdx-US9-9ia", thumb: THUMB("1cDcZXBg51fdhFZoqRJzgUzIUj10hAIjM") },
        ],
        videos: [
          { title: "Ionic Bonding Intro - How Cations and Anions Bond Together", id: "MpaLHoc-_xg" },
          { title: "Ionic Bonding: How Cations and Anions Form Ionic Lattices", id: "vj6PurxiFHs" },
          { title: "Ionic Bonds: Cations and Anions", id: "C1GsMv8B2Fg" },
          { title: "Ionic Bonding", id: "hiyTfhjeF_U" },
          { title: "How Does Electronegativity Relate To Ionic Bonds?", id: "JUQ-EHqssSg" },
          { title: "How Do Ionic Bonds Form?", id: "2vD-LuqTzLY" },
        ],
      },
      {
        title: "VSEPR Theory",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vQDKRh_NJffDvUHc6QIxsOsIr_pvTdJCmHGwkbDNaRxLilmdbCzN8EJAm71N1eRTjtTodkwG8lhbaDc/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to determine molecular shape using VSEPR theory.",
          "I will be able to relate molecular polarity to molecular shape.",
        ],
        assignments: [
          { label: "Polarity Practice (8)", url: "https://kami.app/MAj-ygv-FAM-KgD", thumb: THUMB("1irBbQpaPJl6VyWrfS8CwigLke3b_pBhj") },
          { label: "Chemical Bonding Homework", url: "https://kami.app/sCm-kLs-85c-vH4", thumb: THUMB("1sKZ_gXq2gKccYw_19IwpJffCKgewhztq") },
        ],
        videos: [
          { title: "Chemistry II: Video 6-1: VSEPR Theory and Polarity", id: "FZvZd4VNe9o" },
          { title: "VSEPR & Molecular Polarity", id: "GlU9epvu268" },
          { title: "Molecules EXPLAINED | VSEPR Theory, Polarity, Intermolecular Forces", id: "-PESqwqXNxU" },
          { title: "Polarity in VSEPR Shapes", id: "NZ5Wf_dPcOM" },
          { title: "VSEPR Theory - Basic Introduction", id: "DBrq31w8vC4" },
          { title: "Polar vs. Nonpolar Using VSEPR Theory", id: "h-YQbEJwcNs" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to distinguish covalent from ionic bonds based on lab observations.",
          "I will be able to build molecular models to determine geometry using VSEPR theory.",
        ],
        assignments: [
          { label: "Lab — Polarity and Solubility", url: "https://docs.google.com/document/d/1SNKwXHcRlCEvGntM5TBBy6qt1CWcVwhtR3nmZBDmL7w/edit", thumb: THUMB("18Yjeka1Ga_7MNMVnMXB-pohHqgPLAyAd") },
          { label: "Lab — Properties of Ionic and Covalent Substances", url: "https://kami.app/pxg-C7C-Pk9-8jq", thumb: THUMB("1H6VSSX8ZvWm_dJc5CYuNB64UnXdlHxTI") },
          { label: "Lab — Formations of Compounds with Polyatomic Ions", url: "https://kami.app/tvc-uHb-ji6-hbn", thumb: THUMB("1uut6bDKH5SLHkJs5D5QYhP2Y0ncMmkez") },
          { label: "Lab — Properties of Covalent and Ionic Bonds", url: "https://kami.app/EF1-hz1-P7s-wD3", thumb: THUMB("1qTxOpVGJEsGZNLRlzxSSq0_zf3F-tduO") },
          { label: "Lab — VSEPR Theory Molecular Geometry", url: "https://kami.app/exm-va3-8uu-Pp8", thumb: THUMB("148SNPyns-FdCIDsS_PUZe6-B2pr2Fcl_") },
        ],
      },
    ],
  },
  {
    unit: "Unit 9",
    title: "Unit 9 — Heat",
    overview: ["Heat", "Heating Curves", "Labs"],
    lessons: [
      {
        title: "Heat",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vQS-3mNRDqBvdzPgDUhIJTSG8nYNdKnS20n1YiK-0-ABteTqzYhSdxiATVHFCrCNW8_0jxvdRVSGMfF/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to calculate heat transfer using q = mcΔT.",
          "I will be able to distinguish between endothermic and exothermic processes.",
        ],
        assignments: [
          { label: "Copy — Thermochemistry Practice (8)", url: "https://kami.app/Zup-qjw-Asw-U6t", thumb: THUMB("1fv-AN0WmEwOPvba-fVcRinLUx2-SrXWT") },
          { label: "Heat Practice Problems", url: "https://kami.app/1mT-qG3-BQP-AcJ", thumb: THUMB("1FZBM4GMPBY_xCOGN3e-BZwD_Fqp3L0NZ") },
        ],
        videos: [
          { title: "Calorimetry Specific Heat Capacity q=mcΔT Made Super Simple", id: "SCjFC_Vy1cY" },
          { title: "Heat and Calorimetry | How to Use the Equation Q=MCΔT in Chemistry", id: "mYFgaVqeIm4" },
          { title: "Specific Heat Capacity (q=mCΔT) Examples, Practice Problems", id: "LWTbCetd5EM" },
          { title: "Calorimetry, Specific Heat Capacity, and Q=MCΔT", id: "Xn-vRyWu7mI" },
          { title: "Heat Transfer and Specific Heat Capacity", id: "q6u6Rf2-1Jo" },
          { title: "Energy Changes in Chemical Reactions - Exothermic and Endothermic Reactions", id: "RysUDc8aIYA" },
        ],
      },
      {
        title: "Heating Curves",
                slides: "https://docs.google.com/presentation/d/e/2PACX-1vQqscjI-MYcAWSnZQu3iroertkeyG0Hp0yaij0U9BetCPXmIh7M20rnUdxtCheOeHlk5VTspWjEDg6U/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to interpret a heating curve for a substance.",
          "I will be able to identify phase changes and their associated temperature behavior on a heating curve.",
        ],
        assignments: [
          { label: "Heating Curve Worksheet", url: "https://drive.google.com/file/d/1I0vBGH6XD7EUdUZQ4lRQXYauIKm4lUAg/view", thumb: THUMB("1I0vBGH6XD7EUdUZQ4lRQXYauIKm4lUAg") },
          { label: "Copy of Heat Practice Problems", url: "https://kami.app/UEj-Kh8-GNn-Msi", thumb: THUMB("1pTlEjn-YU4hj6YhPvc_oVS5F0l4mZhh-") },
        ],
        videos: [
          { title: "What Are the Phase Changes in Chemistry | Why Does the Heating Curve Look Like That", id: "2rIYaJDetkM" },
          { title: "It's THIS Easy!? Reading a Heating Curve (Phase Change Diagram)", id: "gMLxKRr3L54" },
          { title: "Phase Diagrams and Heating/Cooling Curves", id: "0TfYd9B6ttM" },
          { title: "IGCSE Chemistry | Heating & Cooling Curves Explained", id: "MmrkoKhRGaQ" },
          { title: "Heating Curves Tutorial: How to Calculate Enthalpy Changes in Heating & Cooling", id: "MGcPQtaQHeA" },
          { title: "Heating Curve for Water | Khan Academy", id: "MqAVc_XaIXQ" },
        ],
      },
      {
        title: "Labs",
        slides: "",
        goals: [
          "I will be able to classify a lab process as endothermic or exothermic based on temperature data.",
          "I will be able to calculate the specific heat of a metal from experimental data.",
          "I will be able to calculate heat of combustion or crystallization from lab data.",
        ],
        assignments: [
          { label: "Lab — Endothermic or Exothermic", url: "https://kami.app/CGG-gjb-Kjv-UQB", thumb: THUMB("1oHlMcv5-TQZ4oUs-F2PPl4T7DTik1s59") },
          { label: "Lab — Heat of Combustion", url: "https://kami.app/Bik-VKW-X55-W2X", thumb: THUMB("1BEy-vSPAmVEW_ObM4kMbPosFiordiAC7") },
          { label: "Lab — Specific Heat of a Metal", url: "https://kami.app/E3R-xZ8-GpF-vE3", thumb: THUMB("1ZtOvl0Ukd1nv_EYIYeBNa57kWE54jse1") },
          { label: "Lab — Heat of Crystallization of Wax", url: "https://kami.app/eVm-R7V-KSZ-MB7", thumb: THUMB("10mYcgy9SXf8PO9NRXLYlyg8h_bnG2O44") },
        ],
      },
    ],
  },
  {
    unit: "Unit 10",
    title: "Unit 10 — Testing",
    overview: ["Testing", "Testing 2"],
    lessons: [
      {
        title: "Testing",
        slides: "",
        // goalPanels exercises the sliding chalkboard mechanic: multiple
        // learning-goal panels stacked behind each other, revealed by
        // pulling the handle on the rail. A lesson with a plain `goals`
        // array (like every other lesson above) still works unchanged —
        // this is the one place we're testing the multi-panel path.
        goalPanels: [
          { label: "Day 1", goals: [
            "I can balance a chemical equation using coefficients.",
            "I can apply the law of conservation of mass.",
          ]},
          { label: "Day 2", goals: [
            "I can classify a reaction as synthesis, decomposition, or combustion.",
            "I can predict the products of a reaction based on its type.",
          ]},
          { label: "5th period", goals: [
            "Pick up where 2nd period left off — continue Word Equations practice.",
          ]},
        ],
        assignments: [],
      },
      {
        title: "Testing 2",
        slides: "",
        // Same mechanic as "Testing," but with five total panels (four
        // movable + the fixed back board) instead of three, to check the
        // fan-out docking holds up with more layers in the pile.
        goalPanels: [
          { label: "Day 1", goals: [
            "I can balance a chemical equation.",
          ]},
          { label: "Day 2", goals: [
            "I can classify a reaction by type.",
          ]},
          { label: "Day 3", goals: [
            "I can calculate moles from mass.",
          ]},
          { label: "Day 4", goals: [
            "I can apply stoichiometric ratios.",
          ]},
          { label: "5th period", goals: [
            "Continue Word Equations practice.",
          ]},
        ],
        assignments: [],
      },
    ],
  },
];

const CALENDAR_SRC = "https://calendar.google.com/calendar/embed?src=d8adc0fd0dfd1fd97185963e18260409e56291e5b338f237d73cf10f4f7a0b61%40group.calendar.google.com&ctz=America%2FChicago";

function Stars({ height = 68 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = height;
    const count = Math.floor((canvas.width * height) / 700);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * height;
      const size = Math.random() * 5 + 3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const angle = (p * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = p % 2 === 0 ? size : size * 0.45;
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [height]);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

function SmartBoard({ src }) {
  // Width-driven sizing on purpose: the frame is always exactly the width of
  // its column (100%) and height falls out of the 16:9 ratio. This makes it
  // structurally impossible for the board to grow wider than its column,
  // no matter how much vertical room is available (unlike a height-driven
  // flex/aspect-ratio approach, which can blow out sideways on tall screens).
  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", background: "#111", borderRadius: "8px 8px 0 0", padding: "8px 8px 0", border: "2px solid #2a2a2a", borderBottom: "none", pointerEvents: "auto" }}>
        <div style={{ width: "100%", background: "#0a0a0a", borderRadius: "4px 4px 0 0", aspectRatio: "16/9", overflow: "hidden", border: "1px solid var(--board-primary)" }}>
          <iframe src={src} style={{ width: "100%", height: "100%", border: "none", display: "block" }} allowFullScreen title="slides" />
        </div>
      </div>
      <div style={{ width: "100%", height: 18, flexShrink: 0, boxSizing: "border-box", background: "#111", border: "2px solid #2a2a2a", borderTop: "1px solid #333", borderRadius: "0 0 6px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", pointerEvents: "auto" }}>
        <span style={{ fontSize: 8, color: "#444", fontFamily: "Oswald, sans-serif", letterSpacing: 2 }}>SMART</span>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a6c1a", boxShadow: "0 0 4px #1a6c1a" }} />
      </div>
      <div style={{ width: "70%", height: 10, flexShrink: 0, boxSizing: "border-box", background: "#0e0e0e", borderRadius: "0 0 4px 4px", border: "1px solid #222", borderTop: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 12px", pointerEvents: "auto" }}>
        {["#2a2a2a", "#8a1a1a", "#1a4a1a", "#1a1a6a"].map((c, i) => (
          <div key={i} style={{ height: 6, width: 22, borderRadius: 2, background: c }} />
        ))}
      </div>
    </div>
  );
}

// A blank-shell teacher's stand-in for Webster Groves' hardcoded
// CALENDAR_SRC on the unit overview screen — same spot the smartboard
// occupies, same footprint, so the unit page looks like a real unit page
// (per Jay's ask: stock unit pages should match Webster Groves' layout,
// just with an "add calendar" affordance where the real one has an
// already-configured calendar). Same collapsed-tile-then-inline-form
// pattern as AddAssignmentCard, for visual consistency.
// Shared "+ Add ..." tile → inline paste-a-URL form, used for both the
// calendar slot and the slides/presentation slot below — same collapsed-
// dashed-tile-then-inline-form pattern established by Full Agenda's
// click-to-edit fields, just parameterized by label/prompt/placeholder
// instead of two near-duplicate components. `initialUrl`, when set,
// pre-fills the input — used when "Change" reopens the form on an
// already-filled slot rather than starting from a blank field.
// `onBrowseDrive`, when passed (only ever by AddSlidesCard — AddCalendarCard
// leaves it undefined), renders a second, real Google-Drive-file-picker
// path alongside the always-available "paste a link" one, in both the
// collapsed empty tile and the expanded paste form. See googleDrive.js for
// the actual OAuth+Picker flow this triggers; this component only owns
// the loading/error UI around calling it.
function AddEmbedCard({ open, label, promptText, placeholder, initialUrl, onOpen, onCancel, onSave, dataTour, onBrowseDrive, browseLabel = "Browse Google Drive", browseBusyLabel = "Connecting to Google Drive…" }) {
  const [url, setUrl] = useState(initialUrl || "");
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState(null);

  const handleBrowseDrive = async () => {
    setDriveError(null);
    setDriveBusy(true);
    try {
      const result = await onBrowseDrive();
      // null means the teacher opened the Google picker and cancelled —
      // not an error, just nothing to do.
      if (result) {
        if (result.shareWarning) setDriveError(result.shareWarning);
        onSave(result.embedUrl);
        // Tell the parent BuildPage to scroll to the top before the reload
        // lands — without this the browser keeps its current scroll position,
        // dropping the teacher into the middle of the (briefly enlarged) page.
        if (window.parent !== window) {
          window.parent.postMessage({ type: "homeroom-drive-slides-saved" }, window.location.origin);
        }
        // Reload synchronously to cut off React's pending re-render before it
        // hits the Google Picker SDK's corrupted fiber tree. The localStorage
        // write in onSave() is synchronous and always completes first, so the
        // reloaded page picks up the saved URL immediately.
        if (!result.noReload) window.location.reload();
      }
    } catch (err) {
      setDriveError(err.message || "Something went wrong opening Google Drive.");
    } finally {
      setDriveBusy(false);
    }
  };

  const driveButton = onBrowseDrive && (
    <button
      type="button"
      onClick={handleBrowseDrive}
      disabled={driveBusy}
      style={{ background: "transparent", border: "1px solid var(--board-secondary)", borderRadius: 2, color: "var(--board-secondary-accent)", fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 12px", cursor: driveBusy ? "default" : "pointer", opacity: driveBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
    >
      {driveBusy ? browseBusyLabel : browseLabel}
    </button>
  );

  if (!open) {
    return (
      <div data-tour={dataTour} style={{ width: "100%", maxWidth: "100%", aspectRatio: "16/9", boxSizing: "border-box", border: "2px dashed rgba(255,255,255,0.25)", borderRadius: 8, color: "rgba(255,255,255,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
        <button
          onClick={onOpen}
          style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "inherit"; }}
        >
          <span style={{ fontSize: 30, lineHeight: 1 }}>+</span>
          {label}
        </button>
        {driveButton && (
          <>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.5 }}>or</div>
            {driveButton}
          </>
        )}
        {driveError && (
          <div style={{ fontSize: 11, color: "#e8a722", textAlign: "center", maxWidth: 320, lineHeight: 1.4 }}>{driveError}</div>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (url.trim()) onSave(url.trim()); }}
      style={{ width: "100%", maxWidth: 480, boxSizing: "border-box", border: "2px solid var(--board-secondary)", borderRadius: 8, background: "#242424", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
    >
      {driveButton && (
        <>
          {driveButton}
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
            or paste a link
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
          </div>
        </>
      )}
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {promptText}
      </div>
      <input
        type="url" placeholder={placeholder} value={url} onChange={e => setUrl(e.target.value)}
        autoFocus
        style={{ background: "var(--board-primary)", border: "1px solid #444", borderRadius: 2, color: "var(--board-primary-fg)", fontSize: 12, padding: "8px 10px", fontFamily: "Lato, sans-serif" }}
      />
      {driveError && (
        <div style={{ fontSize: 11, color: "#e8a722", lineHeight: 1.4 }}>{driveError}</div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" disabled={!url.trim()}
          style={{ flex: 1, background: "var(--board-secondary)", border: "none", borderRadius: 2, color: "var(--board-secondary-fg)", fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 0", cursor: "pointer" }}>
          Save
        </button>
        <button type="button" onClick={onCancel}
          style={{ background: "transparent", border: "1px solid #555", borderRadius: 2, color: "rgba(255,255,255,0.6)", fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 14px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// A blank-shell teacher's stand-in for Webster Groves' hardcoded
// CALENDAR_SRC on the unit overview screen — same spot the smartboard
// occupies, same footprint, so the unit page looks like a real unit page
// (per Jay's ask: stock unit pages should match Webster Groves' layout,
// just with an "add calendar" affordance where the real one has an
// already-configured calendar).
export function AddCalendarCard(props) {
  const driveReady = googleDriveConfigured();
  // Eager script load mirrors AddSlidesCard — GIS needs to be ready before
  // the teacher clicks "Browse Google Calendar" so the OAuth popup can open
  // synchronously within that click handler (see ensureGoogleScriptsLoaded).
  useEffect(() => {
    if (driveReady) ensureGoogleScriptsLoaded().catch(() => {});
  }, [driveReady]);

  return (
    <AddEmbedCard
      {...props}
      label="Add Calendar"
      promptText="Paste your Google Calendar embed URL"
      placeholder="https://calendar.google.com/calendar/embed?src=..."
      onBrowseDrive={driveReady ? pickGoogleCalendar : undefined}
      browseLabel="Browse Google Calendar"
      browseBusyLabel="Loading your calendars…"
    />
  );
}

// The lesson slideshow slot's empty-state tile — same idea as
// AddCalendarCard, one slot lower (per-lesson rather than per-unit). A
// "publish to web" Google Slides URL keeps working exactly like a normal
// embed: edits made later in the source Slides file show up here with no
// extra integration needed. Also offers a real Google Drive picker
// (browse-and-select instead of paste-a-URL) whenever VITE_GOOGLE_CLIENT_ID
// / VITE_GOOGLE_API_KEY are configured (see googleDrive.js + .env.example)
// — silently falls back to paste-only otherwise, so this is a no-op until
// those are set up.
export function AddSlidesCard(props) {
  const driveReady = googleDriveConfigured();
  // Kicks off loading the Google scripts as soon as this tile mounts
  // (not on click) so the OAuth popup a teacher triggers by clicking
  // "Browse Google Drive" can open synchronously within that click — see
  // the comment on ensureGoogleScriptsLoaded in googleDrive.js. Errors
  // here are swallowed on purpose: a transient failure just means the
  // eventual click-triggered attempt retries the load itself and surfaces
  // any real error there, where a teacher can actually see it.
  useEffect(() => {
    if (driveReady) ensureGoogleScriptsLoaded().catch(() => {});
  }, [driveReady]);

  return (
    <AddEmbedCard
      {...props}
      label="Add Slides / Presentation"
      promptText="Paste a Google Slides embed URL (File → Share → Publish to web)"
      placeholder="https://docs.google.com/presentation/d/.../embed"
      onBrowseDrive={driveReady ? pickGoogleSlidesEmbed : undefined}
    />
  );
}

// Wraps an already-filled Build-mode slot (calendar, slides) with a
// "Change" / "Remove" toolbar — never rendered outside isBuildMode, so the
// real board tab never shows it. Sits on top of whatever's already there
// (SmartBoard, an image, etc.) without changing its layout.
//
// Always fully visible now, not hover-revealed — it used to fade to 55%
// opacity outside hover, which over a dark/black slide (the common case)
// was easy to miss entirely, reading as "there's no way to change or
// remove this slide" (Jay: "there should be a change slides or
// presentation button or a delete presentation"). It's Build-mode-only
// chrome to begin with, so there's no real cost to just always showing it;
// the pointer-events "auto" + a solid-enough background keeps it legible
// and clickable over any slide content, and the still-present hover
// border-highlight gives it just enough interactivity feedback.
function BuildEditableSlot({ children, onChange, onRemove, label }) {
  const btnStyle = {
    background: "rgba(20,20,20,0.9)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 3,
    color: "white", fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase",
    letterSpacing: 0.5, padding: "6px 10px", cursor: "pointer", transition: "border-color 0.15s",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
  };
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 5, pointerEvents: "auto" }}>
        <button style={btnStyle} onClick={onChange}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}>
          Change
        </button>
        <button style={{ ...btnStyle, color: "#ff8a65" }} onClick={onRemove}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#ff8a65"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}>
          Remove
        </button>
      </div>
    </div>
  );
}

// `onRemove`, when passed (Build mode only, and only for teacher-uploaded
// assignments — the hardcoded curriculum ones aren't deletable this way),
// shows a small "×" in the corner on hover, matching the hover-reveal
// pattern used elsewhere in Build mode.
// One visual vocabulary for the three things a teacher does to anything in
// Build mode, so the same verb looks the same wherever it appears (Jay:
// "make those buttons standard across all applications"):
//
//   green eye    -> show / hide      red ×  -> remove      orange ✎ -> edit
//
// Circular, white hairline border, drop shadow. Size varies by host -- 26px
// floating over an assignment thumbnail, 20px inside the tighter unit tab
// pill -- but colour and shape never do.
export function buildActionStyle(kind, { size = 26, active = false } = {}) {
  const background =
    kind === "remove"  ? "rgba(210,40,40,0.92)" :
    kind === "edit"    ? "rgba(232,119,34,0.92)" :
    // Grey on purpose: reordering is not one of the three coloured verbs,
    // it is a grip. Colouring it would imply it does something to the item.
    kind === "reorder" ? "rgba(50,50,50,0.92)" :
    active             ? "rgba(40,40,40,0.92)" : "rgba(60,120,60,0.92)";
  return {
    width: size, height: size, borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.4)",
    background, color: "white",
    fontSize: Math.round(size * 0.52),
    lineHeight: 1, padding: 0, cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
    transition: "opacity 0.15s, background 0.15s",
  };
}

export function AssignmentThumb({ label, url, thumb, hidden, onRemove, onRename, onToggleHidden, dragProps }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef(null);
  // The rename input commits on Enter AND on blur, and Enter unmounts the
  // input -- which fires blur. Without this latch the same rename was sent
  // twice, and worse, Escape (which also unmounts) fell through to the blur
  // handler and saved the draft the teacher had just cancelled.
  const settledRef = useRef(false);

  const startRename = (e) => { e.preventDefault(); e.stopPropagation(); settledRef.current = false; setDraft(label); setRenaming(true); };
  const commitRename = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    setRenaming(false);
    if (draft.trim() && draft.trim() !== label) onRename?.(draft.trim());
  };
  const cancelRename = () => { settledRef.current = true; setRenaming(false); };

  if (renaming) {
    return (
      <div style={{ background: "white", borderRadius: 3, overflow: "hidden", position: "relative", border: "2px solid var(--board-secondary)", aspectRatio: "8.5/11", display: "flex", flexDirection: "column" }}>
        {thumb ? (
          <img src={thumb} alt={label} style={{ flex: 1, width: "100%", objectFit: "cover", objectPosition: "top", display: "block", minHeight: 0 }} />
        ) : (
          <div style={{ flex: 1, background: "#f5f5f5", display: "flex", flexDirection: "column", padding: 6, gap: 3, minHeight: 0 }}>
            {[80, 60, 95, 70, 55, 90].map((w, i) => <div key={i} style={{ height: 3, background: "#ccc", borderRadius: 1, width: `${w}%` }} />)}
          </div>
        )}
        <div style={{ background: "rgba(232,119,34,0.95)", padding: "4px 6px", display: "flex", gap: 4 }}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") cancelRename(); }}
            onBlur={commitRename}
            style={{ flex: 1, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 2, color: "white", fontSize: 10, fontFamily: "Oswald, sans-serif", padding: "2px 4px", outline: "none", letterSpacing: 0.5 }}
          />
        </div>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer"
      {...(dragProps || {})}
      style={{ background: "white", borderRadius: 3, overflow: "hidden", cursor: "pointer", position: "relative", border: "2px solid transparent", transition: "all 0.15s", aspectRatio: "8.5/11", textDecoration: "none", display: "block",
        // Only ever dimmed in Build mode: the live board filters hidden
        // assignments out entirely rather than showing a faded one.
        opacity: hidden ? 0.4 : 1 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.querySelector(".aLabel").style.opacity = 1; const r = e.currentTarget.querySelector(".aRemove"); if (r) r.style.opacity = 1; const rn = e.currentTarget.querySelector(".aRename"); if (rn) rn.style.opacity = 1; const h = e.currentTarget.querySelector(".aHide"); if (h) h.style.opacity = 1; const g = e.currentTarget.querySelector(".aDrag"); if (g) g.style.opacity = 1; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.querySelector(".aLabel").style.opacity = 0; const r = e.currentTarget.querySelector(".aRemove"); if (r) r.style.opacity = 0; const rn = e.currentTarget.querySelector(".aRename"); if (rn) rn.style.opacity = 0; const h = e.currentTarget.querySelector(".aHide"); if (h && !hidden) h.style.opacity = 0; const g = e.currentTarget.querySelector(".aDrag"); if (g) g.style.opacity = 0; }}
    >
      {thumb ? (
        <img src={thumb} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#f5f5f5", display: "flex", flexDirection: "column", padding: 6, gap: 3 }}>
          <div style={{ height: 5, background: "#333", borderRadius: 1, width: "70%" }} />
          <div style={{ height: 4 }} />
          {[80, 60, 95, 70, 55, 90].map((w, i) => <div key={i} style={{ height: 3, background: "#ccc", borderRadius: 1, width: `${w}%` }} />)}
        </div>
      )}
      {dragProps && (
        <span
          className="aDrag"
          title="Drag to reorder"
          aria-hidden="true"
          // Sits clear ABOVE the .aLabel bar rather than tight against it.
          // That bar has no fixed height -- it is padding plus one line of the
          // teacher's chosen heading font, which measures 21px (Raleway) to
          // 25px (Oswald, Anton). The old 26 left exactly 1px over the tallest
          // of those, so with the default font the grip's drop shadow landed on
          // the orange bar and it read as half-hidden behind the title.
          style={{ ...buildActionStyle("reorder", { size: 22 }), position: "absolute", bottom: 34, left: 4, cursor: "grab", opacity: 0, fontSize: 12 }}
        >
          ☰
        </span>
      )}
      {onToggleHidden && (
        <button
          className="aHide"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleHidden(); }}
          title={hidden ? "Show on the board" : "Hide from the board"}
          // Unlike the rename/remove buttons this one does NOT fade out when
          // unhovered while the assignment is hidden -- a hidden card has to
          // announce itself, or a teacher has no way to find what to unhide.
          style={{ position: "absolute", top: 4, left: 4, height: 26, padding: "0 9px", borderRadius: 13, border: "2px solid rgba(255,255,255,0.4)", background: hidden ? "rgba(40,40,40,0.92)" : "rgba(60,120,60,0.92)", color: "white", fontSize: 12, lineHeight: "22px", cursor: "pointer", opacity: hidden ? 1 : 0, transition: "opacity 0.15s", boxShadow: "0 2px 6px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 4 }}
        >
          {hidden ? "🚫 Hidden" : "👁"}
        </button>
      )}
      {onRename && (
        <button
          className="aRename"
          onClick={startRename}
          title="Rename assignment"
          style={{ ...buildActionStyle("edit"), position: "absolute", top: 4, right: onRemove ? 34 : 4, opacity: 0 }}
        >
          ✎
        </button>
      )}
      {onRemove && (
        <button
          className="aRemove"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          title="Remove assignment"
          style={{ ...buildActionStyle("remove"), position: "absolute", top: 4, right: 4, opacity: 0 }}
        >
          ×
        </button>
      )}
      <div className="aLabel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(232,119,34,0.95)", color: "white", fontSize: 10, fontFamily: "Oswald, sans-serif", padding: 5, textAlign: "center", opacity: 0, transition: "opacity 0.15s", letterSpacing: 0.5 }}>
        {label}
      </div>
    </a>
  );
}

// The "bring your own PDF" tile: sits at the end of the assignments grid,
// same footprint as AssignmentThumb so it lines up in the grid. Collapsed
// state is just a dashed "+" tile; clicking it swaps in a tiny inline form
// (label + file picker) rather than opening a separate modal, since the
// whole point of this pattern (established by Full Agenda's click-to-edit
// fields) is keeping edits in place rather than navigating away.
export function AddAssignmentCard({ open, busy, error, onOpen, onCancel, onSubmit, onDrivePick }) {
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState(null);

  // Same reasoning as AddSlidesCard's identical effect — preload the
  // Google scripts as soon as this card exists (not on click) so the
  // OAuth popup a teacher triggers by clicking "Browse Google Drive"
  // below can open synchronously within that click.
  const driveReady = googleDriveConfigured();
  useEffect(() => {
    if (driveReady) ensureGoogleScriptsLoaded().catch(() => {});
  }, [driveReady]);

  const handleBrowseDrive = async () => {
    // NOTE: After the Google Picker closes its SDK does DOM cleanup that
    // corrupts React's fiber tree inside the iframe. To avoid a black
    // screen we must NOT call any React state setters after
    // pickGoogleDriveAssignmentFile() returns. Instead we:
    //   1. Call onDrivePick (saves to DB without touching React state)
    //   2. Send postMessage → parent BuildPage reloads the iframe cleanly
    // Declared outside the try so the catch below can still read it —
    // its whole job is deciding whether to reload, and a try-scoped
    // `const` would make that a ReferenceError instead.
    let result = null;
    try {
      result = await pickGoogleDriveAssignmentFile();
      if (result) {
        const assignmentLabel = label.trim() || result.name;
        if (onDrivePick) {
          await onDrivePick({ label: assignmentLabel, driveResult: result });
        }
        // Tell the parent BuildPage to scroll to top before the reload lands.
        if (window.parent !== window) {
          window.parent.postMessage({ type: "homeroom-drive-slides-saved" }, window.location.origin);
        }
        // Self-reload to cut off any pending React re-render before it hits
        // the Picker SDK's corrupted fiber tree (same pattern as AddSlidesCard).
        // MongoDB save above is awaited so the reloaded page picks up the new
        // assignment immediately.
        if (!result.noReload) window.location.reload();
      }
    } catch (err) {
      // Cannot safely call setDriveError here — DOM may already be
      // corrupted by the Picker SDK. Always reload so we escape the
      // corrupted state; the assignment save may not have completed
      // but the board will at least render again.
      console.error("Drive assignment pick failed:", err);
      if (!result?.noReload) window.location.reload();
    }
  };

  if (!open) {
    return (
      <button
        onClick={onOpen}
        style={{
          background: "transparent", borderRadius: 3, cursor: "pointer", aspectRatio: "8.5/11",
          border: "2px dashed rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.4)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary-accent)"; e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
      >
        <span style={{ fontSize: 28, lineHeight: 1 }}>+</span>
        Add Assignment
      </button>
    );
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (label.trim() && file) onSubmit({ label: label.trim(), file }); }}
      style={{
        background: "#242424", borderRadius: 3, aspectRatio: "8.5/11", border: "2px solid var(--board-secondary)",
        display: "flex", flexDirection: "column", padding: 16, boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>Add Assignment</div>
      <input
        type="text" placeholder="Assignment name" value={label} onChange={e => setLabel(e.target.value)}
        disabled={busy} autoFocus
        style={{ background: "var(--board-primary)", border: "1px solid #555", borderRadius: 3, color: "var(--board-primary-fg)", fontSize: 13, padding: "10px 10px", fontFamily: "Lato, sans-serif" }}
      />
      {driveReady && (
        <>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button
              type="button"
              onClick={handleBrowseDrive}
              disabled={busy || driveBusy}
              style={{ width: "100%", background: "transparent", border: "2px solid var(--board-secondary)", borderRadius: 3, color: "var(--board-secondary-accent)", fontFamily: "Oswald, sans-serif", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, padding: "14px 12px", cursor: driveBusy ? "default" : "pointer", opacity: driveBusy ? 0.6 : 1 }}
            >
              {driveBusy ? "Connecting…" : "Browse Google Drive"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 0 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
            or upload a file
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
          </div>
        </>
      )}
      <div style={{ flex: driveReady ? 1 : 2, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed rgba(255,255,255,0.2)", borderRadius: 3, padding: 12, marginTop: driveReady ? 0 : 16 }}>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Lato, sans-serif", textAlign: "center" }}>
          <span style={{ fontSize: 24 }}>📄</span>
          <span>{file ? file.name : "Choose PDF file"}</span>
          <input type="file" accept="application/pdf" disabled={busy}
            onChange={e => { setFile(e.target.files?.[0] || null); }}
            style={{ display: "none" }} />
        </label>
      </div>

      {driveError && <div style={{ fontSize: 11, color: "#e8a722", lineHeight: 1.4, marginTop: 8 }}>{driveError}</div>}
      {error && <div style={{ fontSize: 11, color: "#ff8a65", fontStyle: "italic", marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy || !label.trim() || !file}
          style={{ flex: 1, background: "var(--board-secondary)", border: "none", borderRadius: 3, color: "var(--board-secondary-fg)", fontFamily: "Oswald, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 0", cursor: busy ? "default" : "pointer", opacity: (busy || !label.trim() || !file) ? 0.5 : 1 }}>
          {busy ? "Uploading…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ background: "transparent", border: "1px solid #555", borderRadius: 3, color: "rgba(255,255,255,0.6)", fontFamily: "Oswald, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 14px", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function VideoThumb({ title, id, onPlay }) {
  return (
    <button
      onClick={() => onPlay(id)}
      style={{ background: "#000", borderRadius: 3, overflow: "hidden", cursor: "pointer", position: "relative", border: "2px solid transparent", transition: "all 0.15s", aspectRatio: "16/9", display: "block", padding: 0, textAlign: "left", width: "100%" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <img src={youtubeThumb(id)} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 44, height: 32, borderRadius: 6, background: "rgba(232,119,34,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
          <div style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "13px solid white", marginLeft: 3 }} />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.75)", color: "white", fontSize: 11, fontFamily: "Oswald, sans-serif", padding: "5px 8px", letterSpacing: 0.3 }}>
        {title}
      </div>
    </button>
  );
}

function VideoLibrary({ videos, playingVideoId, setPlayingVideoId }) {
  if (!videos || videos.length === 0) return null;
  const playing = videos.find(v => extractYouTubeId(v.id) === playingVideoId);
  return (
    <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px`, maxWidth: 1700, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
      <div style={{ background: "var(--board-primary)", border: "3px solid var(--board-secondary)", borderRadius: 4, overflow: "hidden", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "var(--board-secondary)", padding: `${SPACE.xs}px ${SPACE.md}px`, fontFamily: "Oswald, sans-serif", fontSize: 14, color: "var(--board-secondary-fg)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
          Video Library
        </div>
        <div style={{ padding: SPACE.sm }}>
          {playing && (
            <div style={{ marginBottom: SPACE.sm }}>
              <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: 3, overflow: "hidden" }}>
                <iframe
                  src={youtubeEmbed(playing.id)}
                  title={playing.title}
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <button
                onClick={() => setPlayingVideoId(null)}
                style={{ marginTop: SPACE.xs, background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#ccc", fontFamily: "Lato, sans-serif", fontSize: 12, padding: "4px 10px", borderRadius: 3, cursor: "pointer" }}
              >
                ✕ Close player
              </button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: SPACE.md }}>
            {videos.map((v, vi) => (
              <VideoThumb key={vi} title={v.title} id={v.id} onPlay={(id) => setPlayingVideoId(extractYouTubeId(id))} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Collapsed dashed "+" button that expands into a small inline text
// input on click — same collapsed-tile-then-inline-form idea as
// AddEmbedCard above, just small enough to sit inside TopBar's thin
// nav strip and dropdown rows instead of a full card. Used for both
// "+ Add Unit" (in the unit nav row) and "+ Add Lesson" (in a unit's
// dropdown) — blank-shell + Build-mode only, never shown on the real
// Webster Groves site or outside Build.
function InlineAddButton({ label, placeholder, defaultValue, onAdd, style, inputStyle }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setValue(defaultValue || ""); setEditing(true); }}
        style={{ background: "transparent", border: "1px dashed rgba(255,255,255,0.4)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", ...style }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary-accent)"; e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
      >
        + {label}
      </button>
    );
  }

  const commit = () => {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed) onAdd(trimmed);
  };

  return (
    <form
      onClick={e => e.stopPropagation()}
      onSubmit={e => { e.preventDefault(); commit(); }}
      style={{ display: "flex", gap: 4, ...style }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") { setEditing(false); } }}
        style={{ background: "var(--board-primary)", border: "1px solid #444", borderRadius: 2, color: "var(--board-primary-fg)", fontSize: 12, padding: "4px 6px", fontFamily: "Lato, sans-serif", minWidth: 0, ...inputStyle }}
      />
    </form>
  );
}

// Kami Bell Ringer overlay — three states managed by the parent:
//   null        → hidden (default)
//   "overlay"   → floating panel over the slides, presentation-friendly
//   "fullscreen" → fills the entire viewport so the teacher can mark up
//
// Uses position:fixed so it escapes every overflow:hidden ancestor and
// always layers on top of the projected board regardless of board layout.
//
// Presentation mode hides Kami's own UI. Kami runs in a cross-origin
// iframe (web.kamihq.com), so we cannot hide its toolbars with CSS or
// JS from here, and its embedding API has no documented "viewer only"
// URL parameter (its docs explicitly say not to hand-edit the viewer
// URL). So we clip instead: the iframe is sized LARGER than its visible
// window and offset by these amounts, pushing Kami's header, left tool
// rail, bottom zoom bar and scrollbars outside the clip. What's left on
// the SmartBoard is just the document — the bell ringer question, which
// is the only thing a class needs to see.
//
// Full Screen renders the iframe untouched so the teacher gets the real
// Kami tools for marking up.
//
// These are Kami's chrome dimensions in CSS pixels. They are fixed
// regardless of container size, so they're absolute px, not percentages.
// If a Kami redesign shifts its layout, retune here — that's the known
// cost of clipping a third-party UI we don't control.
const KAMI_CHROME = {
  top: 48,     // Kami header: logo, doc name, Share, account avatar
  left: 56,    // left vertical tool rail
  right: 16,   // vertical scrollbar
  bottom: 56,  // floating zoom/page controls + horizontal scrollbar
};

function KamiOverlay({ url, state, onToggleFullscreen, onClose, contained = false }) {
  if (!url || !state) return null;
  const isFullscreen = state === "fullscreen";
  return (
    <div style={{
      position: isFullscreen ? "fixed" : (contained ? "absolute" : "fixed"),
      ...(isFullscreen
        ? { inset: 0, borderRadius: 0 }
        : contained
          ? { inset: 0, borderRadius: 8 }
          : { top: "6%", left: "4%", right: "4%", bottom: "6%", borderRadius: 10 }),
      zIndex: 8000,
      display: "flex",
      flexDirection: "column",
      background: "#111",
      boxShadow: "0 12px 60px rgba(0,0,0,0.75)",
      overflow: "hidden",
      transition: "all 0.25s ease",
    }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(0,0,0,0.55)", flexShrink: 0, backdropFilter: "blur(4px)" }}>
        <span style={{ flex: 1, fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>
          Bell Ringer
        </span>
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Minimize to overlay" : "Full screen"}
          style={{ fontFamily: "Lato, sans-serif", fontSize: 12, padding: "5px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 5, color: "#fff", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
        >
          {isFullscreen ? "⊡ Minimize" : "⛶ Full Screen"}
        </button>
        <button
          onClick={onClose}
          title="Close Bell Ringer"
          style={{ fontFamily: "Lato, sans-serif", fontSize: 12, padding: "5px 14px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 5, color: "#fff", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,60,60,0.35)"; e.currentTarget.style.borderColor = "rgba(200,60,60,0.6)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
        >
          ✕ Close
        </button>
      </div>
      {/* Kami iframe. Fullscreen shows it whole (tools and all); the
          contained board view clips Kami's chrome away — see KAMI_CHROME. */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#fff" }}>
        <iframe
          src={url}
          style={isFullscreen
            ? { border: "none", width: "100%", height: "100%", display: "block" }
            : {
                border: "none",
                display: "block",
                position: "absolute",
                top: -KAMI_CHROME.top,
                left: -KAMI_CHROME.left,
                width: `calc(100% + ${KAMI_CHROME.left + KAMI_CHROME.right}px)`,
                height: `calc(100% + ${KAMI_CHROME.top + KAMI_CHROME.bottom}px)`,
              }}
          allow="fullscreen; clipboard-read; clipboard-write"
          title="Bell Ringer — Kami"
        />
      </div>
    </div>
  );
}

function TopBar({ curriculum, activeUnitIdx, isOverview, activeLesson, openDropdown, setOpenDropdown, handleUnitOverview, handleLessonClick, goHome, titleMain, titleAccent, isBlankTeacher, onAddUnit, onAddLesson, onRenameUnit, onDeleteUnit, onMoveUnit, onRenameLesson, onDeleteLesson, onMoveLesson, onReorderLesson, onSetLessonOrder, onToggleUnitVisibility, onToggleLessonVisibility }) {
  // Build-mode-only local state for inline rename and two-step delete.
  const [renamingUnit, setRenamingUnit] = useState(null);   // unitIdx being renamed
  const [renameUnitVal, setRenameUnitVal] = useState("");
  const [deletingUnit, setDeletingUnit] = useState(null);   // unitIdx pending delete confirm
  const [renamingLesson, setRenamingLesson] = useState(null); // { unitIdx, lessonIdx }
  const [renameLessonVal, setRenameLessonVal] = useState("");
  const [deletingLesson, setDeletingLesson] = useState(null); // { unitIdx, lessonIdx }

  // Renaming commits on blur as well as on Enter -- a teacher should never
  // have to press Enter to keep what they typed. Blur is enough now that
  // the lesson list is held open while a rename is in progress (see the
  // tab's onMouseLeave); before that the input could be unmounted by the
  // list closing, and React does not fire onBlur on unmount. The ref holds
  // the latest value so the commit does not depend on a state read.
  const lessonRenameRef = useRef(null);
  const commitLessonRename = (unitIdx, lessonIdx, currentTitle) => {
    const pending = lessonRenameRef.current;
    lessonRenameRef.current = null;
    const v = (pending?.value ?? "").trim();
    if (v && v !== currentTitle) onRenameLesson(unitIdx, lessonIdx, v);
    setRenamingLesson(null);
  };
  // Escape disarms a pending unit delete, same as moving the pointer off it.
  useEffect(() => {
    if (deletingUnit === null) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setDeletingUnit(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deletingUnit]);
  const [dragLessonTitle, setDragLessonTitle] = useState(null); // { unitIdx, title } — stable key during drag
  const [draggingOrder, setDraggingOrder] = useState(null);    // { unitIdx, lessons } — live order while dragging

  // Tiny shared style for the micro action-icon buttons in build mode.
  const microBtn = (extra = {}) => ({
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.14)",
    cursor: "pointer",
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: 400,
    padding: "2px 8px",
    lineHeight: "1.5",
    borderRadius: 12,
    fontFamily: "Lato, sans-serif",
    flexShrink: 0,
    ...extra,
  });
  return (
    <div style={{ background: "var(--board-primary)", borderBottom: "4px solid var(--board-secondary)", flexShrink: 0, position: "relative" }}>
      <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.sm}px`, textAlign: "center", position: "relative" }}>
        <div
          onClick={goHome}
          style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", color: "var(--board-primary-fg)", fontSize: 26, fontWeight: 600, letterSpacing: 2, cursor: "pointer", display: "inline-block" }}
        >
          {titleMain ?? "Webster Groves"} <span style={{ color: "var(--board-secondary-accent)" }}>{titleAccent ?? "Chemistry"}</span>
        </div>

        {/* Opens the Build page — where units/lessons/assignments/calendar
            are edited AND where board formatting (background, layout,
            bulletin, board content, blackboard) is now controlled — in its
            own tab. Used to be two separate icons/pages (⚙ Settings, 🛠
            Build); merged into one now that Build's right-hand panel
            covers everything Settings used to (see BoardSettingsPanel.jsx
            / BuildPage.jsx) — one page for a teacher to remember instead
            of two. Deliberately NOT inline on this board: whatever is on
            this page is what could be projected in front of a class, so no
            add/edit affordance ever lives here (see PROJECT_NOTES.md / the
            open-platform plan doc for the reasoning — Add Assignment and
            Add Calendar used to live inline here and were moved out for
            exactly this reason). */}
        <button
          onClick={e => {
            e.stopPropagation();
            // A named target ("homeroom-build" instead of "_blank") means
            // clicking this again while a Build tab is already open just
            // refocuses that same tab instead of stacking up a fresh one
            // every time. Deliberately NOT passing "noopener" here — Build
            // reads window.opener (see its "← Back to board" handler in
            // BuildPage.jsx) to hand its current lesson back to THIS tab
            // and close itself, instead of opening yet another new tab
            // when a teacher is done editing. Safe to skip noopener: this
            // is a same-origin, first-party popup, not a link to some
            // other site.
            window.open("/build", "homeroom-build");
          }}
          title="Build — add or edit content, and change how the board looks"
          aria-label="Open Build page"
          style={{ position: "absolute", right: SPACE.lg, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "var(--board-primary-fg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--board-secondary)"; e.currentTarget.style.color = "var(--board-secondary-fg)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--board-primary-fg)"; }}
        >
          🛠
        </button>
      </div>

      {/* Unit nav */}
      <div style={{ display: "flex", gap: 6, padding: "6px 6px 0", borderTop: "1px solid #333" }} onClick={e => e.stopPropagation()}>
        {curriculum.map((u, ui) => (
          (!isBuildMode && u.hidden) ? null : (
          <div key={ui} style={{ position: "relative", flex: 1 }}
            onMouseEnter={() => { (u.lessons.length > 0 || (isBuildMode && isBlankTeacher)) && setOpenDropdown(ui); }}
            // Don't close the lesson list out from under an open rename box:
            // closing unmounts the input, and React does not fire onBlur on
            // unmount, so the teacher's typing was simply lost when the
            // pointer left the tab.
            onMouseLeave={() => { if (renamingLesson?.unitIdx === ui) return; setOpenDropdown(prev => (prev === ui ? null : prev)); }}
          >
            {/* Opacity wrapper: applied only to the tab button content so the dropdown
                (which follows) is NOT inside an opacity < 1 stacking context — opacity
                on a parent creates a new stacking context that traps z-index and causes
                the dropdown to render behind the bulletin board. */}
            <div style={{ opacity: (isBuildMode && u.hidden) ? 0.45 : 1 }}>
            {/* Unit name — inline editable in build mode. The whole row
                shares one solid background (var(--board-secondary)) so the
                reorder arrows and options menu read as part of one
                continuous tab pill instead of separate boxes breaking up
                the bar (Jay: "left and right buttons... look better"). */}
              <div style={{ position: "relative", display: "flex", alignItems: "stretch", background: "var(--board-secondary)", borderRadius: 6 }}>
                {isBuildMode && isBlankTeacher && (
                  <button
                    title="Move left"
                    onClick={e => { e.stopPropagation(); onMoveUnit(ui, -1); }}
                    disabled={ui === 0}
                    style={{ background: "transparent", border: "none", cursor: ui === 0 ? "default" : "pointer", color: "var(--board-secondary-fg)", opacity: ui === 0 ? 0.2 : 0.55, fontSize: 11, width: 20, flexShrink: 0, borderRadius: "6px 0 0 6px", transition: "background 0.15s, opacity 0.15s" }}
                    onMouseEnter={e => { if (ui !== 0) { e.currentTarget.style.background = "rgba(0,0,0,0.18)"; e.currentTarget.style.opacity = 1; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = ui === 0 ? 0.2 : 0.55; }}
                  >‹</button>
                )}
                {isBuildMode && isBlankTeacher ? (
                  <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
                    {/* Two states, because one always-on input did not read as
                        editable: it was transparent and borderless, so it
                        looked like a label with a stray underline (Jay: "isn't
                        very obvious that you can change the name"). Now the
                        name is plain text that shows a text cursor on hover,
                        and clicking it swaps in an unmistakable white field.
                        Clicking still opens the unit too, exactly as before --
                        renaming is offered, not forced. */}
                    {renamingUnit === ui ? (
                      <input
                        // Select on mount via the ref rather than onFocus:
                        // autoFocus fires before React's handler is attached,
                        // so onFocus never ran and the teacher had to clear
                        // the old name by hand before typing a new one.
                        ref={el => {
                          // Once, on mount. A ref callback runs on EVERY
                          // render, so selecting unconditionally re-selected
                          // the text after each keystroke and the next letter
                          // replaced the whole title -- typing only ever went
                          // one character deep. The flag lives on the DOM node
                          // so it resets naturally when the input unmounts.
                          if (el && !el.dataset.armed) { el.dataset.armed = "1"; el.focus(); el.select(); }
                        }}
                        value={renameUnitVal}
                        onChange={e => setRenameUnitVal(e.target.value)}
                        onBlur={() => { const v = renameUnitVal.trim(); if (v && v !== u.unit) onRenameUnit(ui, v); setRenamingUnit(null); }}
                        onKeyDown={e => {
                          if (e.key === "Enter") e.target.blur();
                          if (e.key === "Escape") { setRenameUnitVal(u.unit); setRenamingUnit(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ flex: 1, minWidth: 0, background: "#fff", color: "#1a1a1a", border: "2px solid var(--board-secondary-accent)", borderRadius: 4, padding: `${SPACE.xs}px ${SPACE.sm}px`, margin: 2, fontSize: 13, fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontWeight: 600, letterSpacing: 0.5, outline: "none", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
                      />
                    ) : (
                      <button
                        data-tour={ui === 0 ? "tour-unit-tab" : undefined}
                        title={`Open "${u.unit}" — click the name to rename it`}
                        onClick={() => { handleUnitOverview(ui); setOpenDropdown(ui); setRenameUnitVal(u.unit); setRenamingUnit(ui); }}
                        style={{ flex: 1, minWidth: 0, background: "transparent", color: "var(--board-secondary-fg)", border: "none", borderRadius: 4, padding: `${SPACE.sm}px 18px ${SPACE.sm}px ${SPACE.xs}px`, fontSize: 13, fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontWeight: 600, letterSpacing: 0.5, textAlign: "center",
                          // Text cursor, not a pointer: the I-beam is the part
                          // that says "this word is editable" before any click.
                          cursor: "text", transition: "background 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; const pen = e.currentTarget.parentElement.querySelector(".uPen"); if (pen) pen.style.opacity = 1; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; const pen = e.currentTarget.parentElement.querySelector(".uPen"); if (pen) pen.style.opacity = 0.55; }}
                      >
                        {u.unit}
                      </button>
                    )}
                    {/* Pencil hint — the name is editable even before hover.
                        Decorative (pointer-events: none) so clicks land on the
                        control beneath it. */}
                    {renamingUnit !== ui && (
                      <span className="uPen" aria-hidden="true" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--board-secondary-fg)", opacity: 0.55, pointerEvents: "none", transition: "opacity 0.15s" }}>✎</span>
                    )}
                  </div>
                ) : (
                  <button
                    data-tour={ui === 0 ? "tour-unit-tab" : undefined}
                    data-tour-clicked={ui === 0 && activeUnitIdx === ui && isOverview ? "true" : undefined}
                    onClick={() => { handleUnitOverview(ui); setOpenDropdown(ui); }}
                    // Hover-only highlight now (Jay: "id rather it not be
                    // highlighted if nothing is over it") -- no longer stays
                    // white just because this is the currently-viewed unit.
                    style={{ flex: 1, background: "var(--board-secondary)", color: "var(--board-secondary-fg)", border: "none", borderRadius: 6, padding: `${SPACE.sm}px ${SPACE.xs}px`, fontSize: 13, fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", cursor: "pointer", letterSpacing: 0.5, fontWeight: 600, transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--board-secondary)"; e.currentTarget.style.color = "var(--board-secondary-fg)"; }}
                  >
                    {u.unit}
                  </button>
                )}
                {isBuildMode && isBlankTeacher && (
                  <button
                    title="Move right"
                    onClick={e => { e.stopPropagation(); onMoveUnit(ui, 1); }}
                    disabled={ui === curriculum.length - 1}
                    style={{ background: "transparent", border: "none", cursor: ui === curriculum.length - 1 ? "default" : "pointer", color: "var(--board-secondary-fg)", opacity: ui === curriculum.length - 1 ? 0.2 : 0.55, fontSize: 11, width: 20, flexShrink: 0, transition: "background 0.15s, opacity 0.15s" }}
                    onMouseEnter={e => { if (ui !== curriculum.length - 1) { e.currentTarget.style.background = "rgba(0,0,0,0.18)"; e.currentTarget.style.opacity = 1; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = ui === curriculum.length - 1 ? 0.2 : 0.55; }}
                  >›</button>
                )}
                {isBuildMode && isBlankTeacher && (
                  /* Hide/show and delete, using the same vocabulary as the
                     assignment cards (buildActionStyle): green eye to show
                     or hide, red × to remove. Both sit right on the tab --
                     the ⋮ menu they replaced meant a click, a menu, and a
                     second click for one-press actions, and its dropdown
                     was the thing Jay reported as unresponsive.
                     A hidden unit's eye stays lit so it is obvious at a
                     glance which units are hidden. */
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px 0 2px", flexShrink: 0 }}>
                    <button
                      title={u.hidden ? `Show "${u.unit}" on the board` : `Hide "${u.unit}" from the board`}
                      onClick={e => { e.stopPropagation(); onToggleUnitVisibility(ui); }}
                      style={{ ...buildActionStyle("hide", { size: 20, active: u.hidden }), opacity: u.hidden ? 1 : 0.75 }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = u.hidden ? 1 : 0.75; }}
                    >{u.hidden ? "🚫" : "👁"}</button>

                    {/* Two-step, unlike the assignment ×: deleting a unit
                        takes every lesson in it, so one stray click should
                        not do it. Arming widens into a "Delete?" pill; moving
                        the pointer away disarms. */}
                    {deletingUnit === ui ? (
                      <button
                        title={`Delete "${u.unit}" and all of its lessons`}
                        onClick={e => { e.stopPropagation(); onDeleteUnit(ui); setDeletingUnit(null); }}
                        onMouseLeave={() => setDeletingUnit(null)}
                        style={{ ...buildActionStyle("remove", { size: 20 }), width: "auto", borderRadius: 10, padding: "0 8px", fontSize: 10, fontFamily: "Lato, sans-serif", letterSpacing: 0.3 }}
                      >Delete?</button>
                    ) : (
                      <button
                        title={`Delete "${u.unit}"`}
                        onClick={e => { e.stopPropagation(); setDeletingUnit(ui); }}
                        style={{ ...buildActionStyle("remove", { size: 20 }), opacity: 0.75 }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = 0.75; }}
                      >×</button>
                    )}
                  </div>
                )}
              </div>

            </div>{/* end opacity wrapper */}

            {/* Dropdown — also opens (empty except the add-lesson row) for a
                zero-lesson unit while in Build mode, so a freshly-added
                unit is actually reachable to add its first lesson. */}
            {(openDropdown === ui || renamingLesson?.unitIdx === ui) && (u.lessons.length > 0 || (isBuildMode && isBlankTeacher)) && (
              // Deliberately `width: "100%"` rather than the old fixed
              // `minWidth: 210` — this div's parent is the same `flex: 1`
              // column as the unit's own button above, so `100%` makes the
              // dropdown line up exactly with that unit's segment of the
              // nav bar, whatever that happens to be (one wide segment
              // with a single unit, several narrower ones with many).
              // `whiteSpace: "normal"` (was `"nowrap"`) lets a long lesson
              // title wrap onto a second line instead of overflowing past
              // that width when a unit segment is narrow.
              <div style={{ position: "absolute", top: "100%", left: 0, width: "100%", background: "var(--board-primary)", border: "1px solid var(--board-secondary)", borderTop: "none", borderRadius: "0 0 4px 4px", zIndex: 5000, overflow: "hidden" }}>
                {/* Build sees hidden lessons (dimmed, so they can be brought
                    back); the live board does not see them at all. Indexes
                    come from the unfiltered list so rename/delete/reorder
                    still address the right lesson. */}
                {(draggingOrder?.unitIdx === ui ? draggingOrder.lessons : u.lessons)
                  .map((lesson, li) => ({ lesson, li }))
                  .filter(({ lesson }) => isBuildMode || !lesson.hidden)
                  .map(({ lesson, li }) => (
                  <div key={li}
                    data-tour={ui === 0 && li === 0 ? "tour-lesson-item" : undefined}
                    style={{ borderBottom: "1px solid #2a2a2a", borderLeft: activeLesson?.title === lesson.title ? "3px solid var(--board-secondary-accent)" : "3px solid transparent", opacity: (dragLessonTitle?.unitIdx === ui && dragLessonTitle?.title === lesson.title) ? 0.4 : (lesson.hidden ? 0.5 : 1) }}
                    onDragOver={isBuildMode && isBlankTeacher ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragLessonTitle && dragLessonTitle.unitIdx === ui && dragLessonTitle.title !== lesson.title && draggingOrder) { const ls = [...draggingOrder.lessons]; const from = ls.findIndex(l => l.title === dragLessonTitle.title); const to = ls.findIndex(l => l.title === lesson.title); if (from !== -1 && to !== -1) { const [mv] = ls.splice(from, 1); ls.splice(to, 0, mv); setDraggingOrder({ unitIdx: ui, lessons: ls }); } } }) : undefined}
                  >
                    {/* Lesson row — inline editable in build mode */}
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {isBuildMode && isBlankTeacher && (
                          <div
                            draggable
                            onDragStart={e => { e.stopPropagation(); setDragLessonTitle({ unitIdx: ui, title: lesson.title }); setDraggingOrder({ unitIdx: ui, lessons: [...u.lessons] }); e.dataTransfer.effectAllowed = "move"; }}
                            onDragEnd={() => { if (draggingOrder) onSetLessonOrder(draggingOrder.unitIdx, draggingOrder.lessons); setDragLessonTitle(null); setDraggingOrder(null); }}
                            title="Drag to reorder"
                            style={{ display: "flex", alignItems: "center", paddingLeft: 7, paddingRight: 4, flexShrink: 0, cursor: "grab", color: "rgba(255,255,255,0.3)", fontSize: 15, userSelect: "none" }}
                          >≡</div>
                        )}
                        {isBuildMode && isBlankTeacher ? (
                          renamingLesson?.unitIdx === ui && renamingLesson?.lessonIdx === li ? (
                            <input
                              ref={el => {
                          // Once, on mount. A ref callback runs on EVERY
                          // render, so selecting unconditionally re-selected
                          // the text after each keystroke and the next letter
                          // replaced the whole title -- typing only ever went
                          // one character deep. The flag lives on the DOM node
                          // so it resets naturally when the input unmounts.
                          if (el && !el.dataset.armed) { el.dataset.armed = "1"; el.focus(); el.select(); }
                        }}
                              value={renameLessonVal}
                              onChange={e => { setRenameLessonVal(e.target.value); lessonRenameRef.current = { value: e.target.value }; }}
                              onBlur={() => { commitLessonRename(ui, li, lesson.title); }}
                              onKeyDown={e => {
                                if (e.key === "Enter") e.target.blur();
                                if (e.key === "Escape") { lessonRenameRef.current = null; setRenameLessonVal(lesson.title); setRenamingLesson(null); }
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{ flex: 1, minWidth: 0, background: "#fff", color: "#1a1a1a", border: "2px solid var(--board-secondary-accent)", borderRadius: 4, margin: 3, padding: `${SPACE.xs}px ${SPACE.sm}px`, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, outline: "none", boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}
                            />
                          ) : (
                            /* Plain text that navigates, same as the live board.
                               Renaming is the pencil now, not a click on the
                               title -- a lesson row is narrow and clicking it
                               to open the lesson is the far commoner action. */
                            <div
                              onClick={() => handleLessonClick(ui, lesson)}
                              style={{ flex: 1, minWidth: 0, padding: `${SPACE.sm}px ${SPACE.md}px`, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: activeLesson?.title === lesson.title ? "var(--board-secondary-accent)" : "#ccc", cursor: "pointer", transition: "all 0.12s", whiteSpace: "normal" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "var(--board-secondary)"; e.currentTarget.style.color = "var(--board-secondary-fg)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = activeLesson?.title === lesson.title ? "var(--board-secondary-accent)" : "#ccc"; }}
                            >
                              {lesson.title}
                            </div>
                          )
                        ) : (
                          <div
                            onClick={() => handleLessonClick(ui, lesson)}
                            style={{ flex: 1, padding: `${SPACE.sm}px ${SPACE.md}px`, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: activeLesson?.title === lesson.title ? "var(--board-secondary-accent)" : "#ccc", cursor: "pointer", transition: "all 0.12s", whiteSpace: "normal", paddingLeft: activeLesson?.title === lesson.title ? SPACE.md - 3 : SPACE.md }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--board-secondary)"; e.currentTarget.style.color = "var(--board-secondary-fg)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = activeLesson?.title === lesson.title ? "var(--board-secondary-accent)" : "#ccc"; }}
                          >
                            {lesson.title}
                          </div>
                        )}
                        {/* Both halves of the identity, not just lessonIdx:
                            lesson 0 of every unit shares an index, so renaming
                            one made the controls vanish from the first lesson
                            of every other unit too. */}
                        {isBuildMode && isBlankTeacher && !(renamingLesson?.unitIdx === ui && renamingLesson?.lessonIdx === li) && (
                          /* Rename / hide / delete, in the same vocabulary as
                             the unit tabs and assignment cards. */
                          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 7px", flexShrink: 0 }}>
                            <button
                              title={`Rename "${lesson.title}"`}
                              onClick={e => { e.stopPropagation(); setRenameLessonVal(lesson.title); setRenamingLesson({ unitIdx: ui, lessonIdx: li }); setDeletingLesson(null); }}
                              style={{ ...buildActionStyle("edit", { size: 18 }), opacity: 0.75 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = 0.75; }}
                            >✎</button>
                            <button
                              title={lesson.hidden ? `Show "${lesson.title}" on the board` : `Hide "${lesson.title}" from the board`}
                              onClick={e => { e.stopPropagation(); onToggleLessonVisibility(ui, li); }}
                              style={{ ...buildActionStyle("hide", { size: 18, active: lesson.hidden }), opacity: lesson.hidden ? 1 : 0.75 }}
                              onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                              onMouseLeave={e => { e.currentTarget.style.opacity = lesson.hidden ? 1 : 0.75; }}
                            >{lesson.hidden ? "🚫" : "👁"}</button>
                            {deletingLesson?.unitIdx === ui && deletingLesson?.lessonIdx === li ? (
                              <button
                                title={`Delete "${lesson.title}"`}
                                onClick={e => { e.stopPropagation(); onDeleteLesson(ui, li); setDeletingLesson(null); }}
                                onMouseLeave={() => setDeletingLesson(null)}
                                style={{ ...buildActionStyle("remove", { size: 18 }), width: "auto", borderRadius: 9, padding: "0 7px", fontSize: 9, fontFamily: "Lato, sans-serif" }}
                              >Delete?</button>
                            ) : (
                              <button
                                title={`Delete "${lesson.title}"`}
                                onClick={e => { e.stopPropagation(); setDeletingLesson({ unitIdx: ui, lessonIdx: li }); setRenamingLesson(null); }}
                                style={{ ...buildActionStyle("remove", { size: 18 }), opacity: 0.75 }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = 0.75; }}
                              >×</button>
                            )}
                          </div>
                        )}
                      </div>
                  </div>
                ))}
                {isBuildMode && isBlankTeacher && (
                  <div data-tour={ui === 0 ? "tour-add-lesson" : undefined} style={{ padding: `${SPACE.sm}px ${SPACE.md}px` }}>
                    <InlineAddButton
                      label="Add Lesson"
                      placeholder={`Lesson ${u.lessons.length + 1}`}
                      defaultValue={`Lesson ${u.lessons.length + 1}`}
                      onAdd={(title) => onAddLesson(ui, title)}
                      style={{ width: "100%", padding: "6px 8px" }}
                      inputStyle={{ width: "100%" }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          )
          ))}

        {isBuildMode && isBlankTeacher && (
          <div data-tour="tour-add-unit" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: `0 ${SPACE.sm}px` }}>
            <InlineAddButton
              label="Add Unit"
              placeholder={`Unit ${curriculum.length + 1}`}
              defaultValue={`Unit ${curriculum.length + 1}`}
              onAdd={onAddUnit}
              style={{ padding: "8px 12px" }}
            />
          </div>
        )}
      </div>

    </div>
  );
}

// Turns a persisted { unitIdx, lessonTitle } (or null, for the homepage)
// back into real { unitIdx, lesson } state — resolving the title back to
// the actual lesson object rather than storing the whole lesson (which
// would go stale the moment curriculum content changes) or an index into
// `lessons` (which shifts if lessons are ever reordered). unitIdx null or
// lessonTitle null both mean "no lesson" — a unit overview only sets
// unitIdx, the homepage sets neither.
// Where this tab's Build/Preview page currently is. Tab-local by design --
// see the effect that writes it.
const BUILD_VIEW_STORAGE_KEY = "homeroom-build-view";

function readBuildView() {
  try {
    const raw = sessionStorage.getItem(BUILD_VIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function resolveView(view, curriculumData) {
  if (!view || view.unitIdx == null) return { unitIdx: null, lesson: null };
  const unit = curriculumData[view.unitIdx];
  if (!unit) return { unitIdx: null, lesson: null };
  const lesson = view.lessonTitle ? unit.lessons.find(l => l.title === view.lessonTitle) || null : null;
  return { unitIdx: view.unitIdx, lesson };
}

// A "different teacher" shell — same board, same formatting system, zero
// pre-filled content. Used for any active teacher id other than
// DEFAULT_TEACHER_ID (Webster Groves' real site), so Jay can freely
// experiment with the open-platform "bring your own content" flow
// (uploading assignments now, slides/other resource types later) without
// any risk of touching the real curriculum data above.
//
// Deliberately empty — no starter unit or lesson. A brand-new teacher
// lands on a genuinely blank board and the GuidedTour (see GuidedTour.jsx)
// walks them through creating their own Unit 1 and Lesson 1 via the real
// "+ Add Unit"/"+ Add Lesson" controls in TopBar, rather than being handed
// pre-made ones to just click through. This used to ship one starter
// unit/lesson so there was always something to land on; that's no longer
// needed since the tour itself now creates the first real content.
export const BLANK_CURRICULUM = [];

export default function App() {
  // Which "teacher" is active — DEFAULT_TEACHER_ID is the real Webster
  // Groves site; anything else gets the blank shell below instead. See
  // getActiveTeacherId in boardConfig.js for how this is chosen
  // (?teacher=... URL param, sticky via localStorage).
  const activeTeacherId = getActiveTeacherId();
  const isBlankTeacher = activeTeacherId !== DEFAULT_TEACHER_ID;

  // Blank-shell teachers only: their own saved units/lessons list, added
  // to via the "+ Add Unit"/"+ Add Lesson" controls in TopBar (Build mode
  // only — see handleAddUnit/handleAddLesson below). Starts as
  // BLANK_CURRICULUM (empty — see its own comment) and gets replaced once
  // a saved document actually loads, so a teacher who's already added
  // content sees it again on return instead of a fresh empty board. A
  // brand-new teacher's first unit and lesson get created for real
  // through GuidedTour.jsx's walkthrough, not pre-seeded here. The real
  // Webster Groves site (DEFAULT_TEACHER_ID) never fetches or writes this
  // at all; its curriculum stays the hardcoded `curriculum` export below,
  // unrelated to any of this.
  const [blankUnits, setBlankUnits] = useState(BLANK_CURRICULUM);
  useEffect(() => {
    if (!isBlankTeacher) return;
    let cancelled = false;
    fetchCurriculum(activeTeacherId)
      .then(units => { if (!cancelled && units && units.length) setBlankUnits(units); })
      .catch(() => {}); // no saved curriculum yet, or a transient error — the starter unit stays
    return () => { cancelled = true; };
  }, [isBlankTeacher, activeTeacherId]);
  const activeCurriculum = isBlankTeacher ? blankUnits : curriculum;

  // Blank-shell teachers only: the school/subject + colors they picked
  // during onboarding (ProfileOnboarding.jsx) become this board's title
  // and theme — replacing the "Webster Groves"/"Chemistry" title and the
  // black/orange literals everywhere in this file (now var(--board-
  // primary)/var(--board-secondary), see boardThemeVars in boardConfig.js).
  // The real Webster Groves site (DEFAULT_TEACHER_ID) never fetches or
  // reads this — it keeps its own fixed branding regardless.
  const [teacherProfile, setTeacherProfile] = useState(null);
  useEffect(() => {
    if (!isBlankTeacher) return;
    let cancelled = false;
    fetchProfile(activeTeacherId)
      .then(p => { if (!cancelled) setTeacherProfile(p); })
      .catch(() => {}); // no profile yet, or a transient error — falls back to defaults below
    return () => { cancelled = true; };
  }, [isBlankTeacher, activeTeacherId]);
  const themeVars = isBlankTeacher
    ? boardThemeVars(teacherProfile?.primaryColor, teacherProfile?.secondaryColor, teacherProfile?.headingFont, teacherProfile?.bodyFont)
    : boardThemeVars(); // Webster Groves keeps its fixed Oswald/Lato defaults regardless
  const boardTitleMain = isBlankTeacher ? (teacherProfile?.school || "Your School") : undefined;
  const boardTitleAccent = isBlankTeacher ? (teacherProfile?.subject || "Your Subject") : undefined;

  // A real board tab starts at the homepage by default, same as always —
  // UNLESS it's a deep link with explicit ?unit=&lesson= params (see
  // readViewFromUrlParams above), which is exactly what Build's "← Back to
  // board" link now sends so it can return the teacher to whatever lesson
  // Build had open rather than resetting them to the homepage. Both
  // embedded copies of this same app — Settings' read-only preview
  // (isPreviewMode) and Build's editable one (isBuildMode) — instead
  // restore whatever lesson the teacher's real board tab currently has
  // open, so clicking the gear or the wrench-and-hammer icon while on,
  // say, Lesson 1 opens straight to that same Lesson 1 (editable, for
  // Build) instead of dumping the teacher back at the homepage and making
  // them re-navigate.
  //
  // Computed ONCE, via a ref. This used to be a plain expression in the
  // component body, so it re-ran on every render -- reading the restore
  // key, deleting it, and putting it back each time -- while its result
  // was only ever used as the useState initial value below and discarded
  // from the second render on. On whichever render the curriculum had
  // finished loading, it resolved successfully, consumed the key for
  // good, and threw the answer away; the effect further down then found
  // nothing and fell back to readCurrentView(), which in Build is the
  // REAL board tab's view -- usually a unit page. That is why saving
  // slides from the Drive picker landed on the unit instead of the lesson
  // just edited. Reading a one-shot value like this has to happen once.
  const initialViewRef = useRef(null);
  if (initialViewRef.current === null) initialViewRef.current = (isPreviewMode || isBuildMode)
    ? (() => {
        try {
          const raw = sessionStorage.getItem("homeroom-build-reload-restore");
          if (raw) {
            sessionStorage.removeItem("homeroom-build-reload-restore");
            const parsed = JSON.parse(raw);
            const v = resolveView(parsed, activeCurriculum);
            // Only treat the restore as satisfied if we got what was asked
            // for. A blank-shell teacher's units can be present from the
            // localStorage cache while that copy's lessons are still stale,
            // so the unit resolves and the lesson does not -- and consuming
            // the key on that partial match stranded the teacher on the unit
            // page with nothing left for the effect below to retry with.
            // That is the reported bug: saving slides landed on the unit
            // instead of the lesson just edited.
            if (v.unitIdx !== null && (!parsed.lessonTitle || v.lesson)) return v;
            // Not resolved (or only half resolved) — put it back so the
            // re-resolve effect can try again once the real units load.
            sessionStorage.setItem("homeroom-build-reload-restore", raw);
          }
        } catch {}
        return resolveView(readBuildView() || readCurrentView(), activeCurriculum);
      })()
    : resolveView(readViewFromUrlParams(), activeCurriculum);
  const initialView = initialViewRef.current;
  const [activeUnitIdx, setActiveUnitIdx] = useState(initialView.unitIdx);
  const [activeLesson, setActiveLesson] = useState(initialView.lesson);


  // Blank-shell teachers fetch their curriculum async — blankUnits starts
  // empty so the initialView above resolves against an empty curriculum and
  // falls back to home. Once the real units load, re-resolve the saved/
  // requested view and jump there if we're still sitting at home
  // (unitIdx === null). This has to cover the plain real board tab too
  // (readViewFromUrlParams), not just Preview/Build (readCurrentView) —
  // Build's "← Back to board" link sends a blank-shell teacher's real tab
  // straight to a deep-linked ?unit=&lesson= URL, and without this branch
  // that param was silently dropped: the very first render resolves it
  // against an empty blankUnits and falls back to home, then nothing ever
  // re-checked it once the real units arrived a beat later (the bug
  // report: "back to board" briefly flashes the right lesson, then lands
  // on the homepage instead).
  useEffect(() => {
    if (!isBlankTeacher) return;
    if (blankUnits.length === 0) return; // still loading or truly empty
    let saved = null;
    let pendingRaw = null;
    try {
      pendingRaw = sessionStorage.getItem("homeroom-build-reload-restore");
      if (pendingRaw) saved = JSON.parse(pendingRaw);
    } catch {}
    // A pending restore wins even when we have already landed somewhere.
    // Build mode never calls writeCurrentView (see the effect above), so
    // the first render -- which resolves against a still-empty curriculum
    // -- falls back to readCurrentView(), i.e. whatever the REAL board tab
    // was looking at, typically a unit page. That set activeUnitIdx, and
    // the old `activeUnitIdx !== null` guard here then bailed out and
    // threw the restore away: saving slides from the Drive picker reloaded
    // Build onto a unit page instead of the lesson just edited.
    if (!saved) {
      if (activeUnitIdx !== null) return;  // already navigated somewhere
      saved = (isPreviewMode || isBuildMode) ? (readBuildView() || readCurrentView()) : readViewFromUrlParams();
    }
    if (!saved) return;
    const view = resolveView(saved, blankUnits);
    // Same partial-match rule as initialView: blankUnits can arrive with
    // the unit present but its lessons not yet filled in, and applying
    // that half-answer (unit, no lesson) while clearing the key left the
    // teacher on the unit page for good. Hold the key until the lesson
    // actually resolves; a later blankUnits update retries.
    const fullyResolved = view.unitIdx !== null && (!saved.lessonTitle || view.lesson);
    if (!fullyResolved) return;
    if (pendingRaw) { try { sessionStorage.removeItem("homeroom-build-reload-restore"); } catch {} }
    setActiveUnitIdx(view.unitIdx);
    setActiveLesson(view.lesson);
  }, [blankUnits]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only meaningful in preview mode — which category Settings currently
  // has expanded, so the matching region of the board can get the same
  // orange highlight glow the old mockup preview used to draw itself.
  // Set via postMessage from SettingsPage.jsx (see the listener below),
  // since Settings is a separate tab/document, not a prop.
  const [highlightRegion, setHighlightRegion] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [playingVideoId, setPlayingVideoId] = useState(null);
  const [checkedGoals, setCheckedGoals] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(scopedKey(GOALS_STORAGE_KEY))) || {};
    } catch {
      return {};
    }
  });
  // Every board customization setting below is a "cross-tab-synced
  // setting" (see useScopedSetting in boardConfig.js): persisted to a
  // scoped localStorage key, AND live-updated here if that same key
  // changes in another tab — i.e. the new Settings page (SettingsPage.jsx)
  // opened via the gear icon. No backend needed for the two tabs to stay
  // in sync; the browser's native `storage` event does it.
  const [arrangementKey, setArrangementKey] = useScopedSetting(ARRANGEMENT_STORAGE_KEY, DEFAULT_ARRANGEMENT, k => !!BOARD_ARRANGEMENTS[k]);
  const [bulletinStyleKey, setBulletinStyleKey] = useScopedSetting(BULLETIN_STORAGE_KEY, DEFAULT_BULLETIN, k => !!BULLETIN_STYLES[k]);
  // Board Content: five independent on/off toggles (replaced the old
  // all-or-nothing Simple Goals / Full Agenda template — see BOARD_COMPONENTS
  // in boardConfig.js). Each is its own cross-tab-synced boolean setting.
  const isOnOff = k => k === "true" || k === "false";
  const [learningGoalsOn] = useScopedSetting(BOARD_COMPONENTS.learningGoals.storageKey, BOARD_COMPONENTS.learningGoals.default, isOnOff);
  const [essentialQuestionOn] = useScopedSetting(BOARD_COMPONENTS.essentialQuestion.storageKey, BOARD_COMPONENTS.essentialQuestion.default, isOnOff);
  const [agendaOn] = useScopedSetting(BOARD_COMPONENTS.agenda.storageKey, BOARD_COMPONENTS.agenda.default, isOnOff);
  const [bellRingerOn] = useScopedSetting(BOARD_COMPONENTS.bellRinger.storageKey, BOARD_COMPONENTS.bellRinger.default, isOnOff);
  const [homeLearningOn] = useScopedSetting(BOARD_COMPONENTS.homeLearning.storageKey, BOARD_COMPONENTS.homeLearning.default, isOnOff);
  const learningGoalsIsOn = learningGoalsOn === "true";
  const essentialQuestionIsOn = essentialQuestionOn === "true";
  const agendaIsOn = agendaOn === "true";
  const bellRingerIsOn = bellRingerOn === "true";
  const homeLearningIsOn = homeLearningOn === "true";
  // Whether any of the four Full Agenda freeform fields are on — drives
  // whether FullAgendaFields renders at all (it's presentational and would
  // otherwise render an empty gap of its own layout gap/Reset button when
  // every one of its four sections is toggled off).
  const anyFullAgendaFieldOn = essentialQuestionIsOn || agendaIsOn || bellRingerIsOn || homeLearningIsOn;
  // Which order the five Board Content components render in, in the flat
  // (non-sliding) goals column — a teacher-chosen order (see Settings'
  // Board Content section), independent of which ones are toggled on.
  const [boardContentOrder] = useBoardContentOrder();
  const [wallTypeKey] = useScopedSetting(WALL_TYPE_STORAGE_KEY, DEFAULT_WALL_TYPE, k => !!WALL_TYPES[k]);
  const [wallColorKey] = useScopedSetting(WALL_COLOR_STORAGE_KEY, DEFAULT_WALL_COLOR_BY_TYPE[DEFAULT_WALL_TYPE], null);
  const [boardSurfaceKey] = useScopedSetting(BOARD_SURFACE_STORAGE_KEY, DEFAULT_BOARD_SURFACE, k => !!BOARD_SURFACES[k]);
  const [slidingBoardsEnabled] = useScopedSetting(SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED, k => k === "true" || k === "false");
  const [slidingBoardsCount] = useScopedSetting(SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, k => /^[2-5]$/.test(k));

  useEffect(() => {
    window.localStorage.setItem(scopedKey(GOALS_STORAGE_KEY), JSON.stringify(checkedGoals));
  }, [checkedGoals]);

  // Mongo mirror of checkedGoals, so a teacher's checked-off learning
  // goals show up the same way on any device instead of living only in
  // this one browser's localStorage (which the state above still writes
  // to first, unconditionally — an instant, offline-friendly cache; this
  // is purely additive). On mount, pull whatever's saved remotely and
  // merge it over the localStorage-seeded initial state — remote wins
  // per-key, since another device may have checked/unchecked something
  // more recently than this browser's own cache. `hasLoadedRemote` gates
  // the save effect below so it can't fire (and overwrite that remote
  // data with this tab's pre-merge state) before the merge above lands.
  const hasLoadedRemote = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchCheckedGoals(activeTeacherId)
      .then(remote => { if (!cancelled && remote) setCheckedGoals(prev => ({ ...prev, ...remote })); })
      .catch(() => {}) // no saved data yet, or a transient error — this browser's own cache stands
      .finally(() => { if (!cancelled) hasLoadedRemote.current = true; });
    return () => { cancelled = true; };
  }, [activeTeacherId]);
  useEffect(() => {
    if (!hasLoadedRemote.current) return;
    saveCheckedGoals(activeTeacherId, checkedGoals).catch(() => {}); // offline/misconfigured Mongo — localStorage above already has it
  }, [activeTeacherId, checkedGoals]);

  // Publish "what's currently open" so the Settings page's preview iframe
  // can restore it (see resolveView above) and keep following it live —
  // but only from a real board tab. The preview copy has isPreviewMode
  // true and must never write here itself: it initializes activeUnitIdx/
  // activeLesson FROM this same value on mount (that's what "real" means
  // to it), so if it also wrote its own copy back, an even-later-loading
  // second preview iframe (or the real tab, if the preview's write raced
  // it) could end up reading the preview's own reflection instead of the
  // teacher's actual navigation. Build mode is excluded for the same
  // reason — navigating around while editing content shouldn't yank the
  // teacher's real board tab (or a Settings preview) to whatever lesson
  // Build happens to be looking at.
  useEffect(() => {
    if (isPreviewMode || isBuildMode) return;
    writeCurrentView(activeUnitIdx == null ? null : { unitIdx: activeUnitIdx, lessonTitle: activeLesson?.title || null });
  }, [activeUnitIdx, activeLesson]);

  // Build-mode-only: tell the parent (BuildPage.jsx) which unit/lesson
  // Build itself currently has open, so its "← Back to board" link can
  // send the teacher back to that exact spot (via the ?unit=&lesson= deep
  // link params — see readViewFromUrlParams above) instead of always
  // resetting to the homepage. Deliberately separate from writeCurrentView
  // above, which stays real-tab-only for the reasons explained there —
  // this is a one-way report to Build's own parent frame, not a write to
  // the shared "what's the real board looking at" value.
  useEffect(() => {
    if (!isBuildMode) return;
    window.parent?.postMessage({
      type: "homeroom-build-current-view",
      unitIdx: activeUnitIdx,
      lessonTitle: activeLesson?.title || null,
    }, window.location.origin);
  }, [activeUnitIdx, activeLesson]);

  // Build/Preview keep a tab-local record of where they are, so ANY reload
  // comes back to the same lesson.
  //
  // Several controls reload the page after talking to Google (slides,
  // calendar, and assignments all do it, to escape the Picker SDK's DOM
  // cleanup). Only the slides handler remembered to stash the view first,
  // so adding an assignment or a calendar reloaded into the fallback --
  // readCurrentView(), which is the REAL board tab's view, usually a unit
  // page. Rather than patch each handler and wait for the next one to
  // forget, the view is recorded here whenever it changes.
  //
  // sessionStorage, not localStorage, and deliberately NOT writeCurrentView:
  // this is "where is THIS tab's Build page", which must not leak into the
  // shared "what is the real board looking at" value -- that is exactly the
  // distinction the writeCurrentView effect above is protecting.
  useEffect(() => {
    if (!isPreviewMode && !isBuildMode) return;
    if (activeUnitIdx === null) return; // home; nothing worth restoring
    try {
      sessionStorage.setItem(BUILD_VIEW_STORAGE_KEY, JSON.stringify({
        unitIdx: activeUnitIdx,
        lessonTitle: activeLesson?.title || null,
      }));
    } catch {}
    // isPreviewMode/isBuildMode are route-derived module scope, not state.
  }, [activeUnitIdx, activeLesson]);

  // Preview-mode-only: follow the real board tab's navigation live, so if
  // a teacher switches lessons while Settings happens to be open, the
  // preview updates too instead of staying frozen on whatever was open
  // when the Settings tab was first opened.
  useEffect(() => {
    if (!isPreviewMode) return;
    const key = scopedKey(CURRENT_VIEW_STORAGE_KEY);
    const handler = (e) => {
      if (e.key !== key) return;
      const { unitIdx, lesson } = resolveView(e.newValue ? JSON.parse(e.newValue) : null);
      setActiveUnitIdx(unitIdx);
      setActiveLesson(lesson);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Preview- and Build-mode: receive "which settings category is
  // expanded" via postMessage (a same-origin iframe and its parent can't
  // share React state directly) — from SettingsPage.jsx's preview, or from
  // Build's own merged BoardSettingsPanel (see BuildPage.jsx) — and mirror
  // it onto the board as the same highlight glow the old static mockup
  // drew around whichever region a category corresponds to (see
  // highlightStyle below).
  useEffect(() => {
    if (!isPreviewMode && !isBuildMode) return;
    const handler = (e) => {
      if (e.source !== window.parent || !e.data || e.data.type !== "homeroom-settings-highlight") return;
      setHighlightRegion(e.data.region || null);
    };
    window.addEventListener("message", handler);
    // Tell the parent we're ready to receive highlight messages — it may
    // have sent one before this listener was attached (iframe load order
    // isn't guaranteed relative to the parent's own effects).
    window.parent?.postMessage({ type: "homeroom-settings-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Meaningful in preview AND build mode: an inline box-shadow glow
  // matching the highlighted settings category, applied directly to the
  // real board's own DOM (background wall, bulletin strip, chalkboard,
  // board layout grid) instead of a mockup's stand-in pieces.
  const highlightStyle = (region) =>
    (isPreviewMode || isBuildMode) && highlightRegion === region
      ? { boxShadow: "0 0 0 3px var(--board-secondary), 0 0 22px rgba(232,119,34,0.55)" }
      : {};

  // Close any open video player when navigating to a different lesson,
  // rather than leaving the previous lesson's video paused-but-open behind.
  useEffect(() => {
    setPlayingVideoId(null);
  }, [activeLesson]);

  const arrangement = BOARD_ARRANGEMENTS[arrangementKey] || BOARD_ARRANGEMENTS[DEFAULT_ARRANGEMENT];
  const bulletinStyle = BULLETIN_STYLES[bulletinStyleKey] || BULLETIN_STYLES[DEFAULT_BULLETIN];
  const wallStyle = wallBackgroundStyle(wallTypeKey, wallColorKey);
  const surface = surfaceColors(boardSurfaceKey);
  const slidingEnabled = slidingBoardsEnabled === "true";
  const slidingCount = parseInt(slidingBoardsCount, 10) || parseInt(DEFAULT_SLIDING_BOARDS_COUNT, 10);

  const isHome = activeUnitIdx === null || (!isBuildMode && !!activeCurriculum[activeUnitIdx]?.hidden);
  const activeUnit = isHome ? null : activeCurriculum[activeUnitIdx];
  const isOverview = activeLesson === null;

  // A blank-shell teacher's own course calendar, shown on the unit
  // overview screen in the same spot Webster Groves' hardcoded
  // CALENDAR_SRC occupies (see boardSlides below). Real site is
  // untouched — this only ever applies when isBlankTeacher. Normally
  // read-only display on a real board tab; the setter and the add/change/
  // remove handlers below are only ever invoked from inside Build mode
  // (see the isBuildMode-gated JSX further down).
  const [calendarUrl, setCalendarUrl] = useState(() => readCalendarUrl());
  const [calendarEditing, setCalendarEditing] = useState(false);
  // Kami Bell Ringer overlay: null = hidden, "overlay" = floating over slides, "fullscreen" = fills viewport
  const [kamiState, setKamiState] = useState(null);
  // Which sliding panel's Bell Ringer opened the overlay (null = the flat,
  // non-sliding layout's own fullAgendaFields) -- the sliding board keeps a
  // separate Kami URL per panel (allPanelFields), so the overlay needs to
  // know which one to read from rather than always falling back to the
  // flat layout's fields.
  const [kamiSourcePanelIdx, setKamiSourcePanelIdx] = useState(null);

  // Fetch calendar URL from MongoDB on mount so it survives clearing site data
  useEffect(() => {
    if (!activeTeacherId) return;
    fetchBoardContent(activeTeacherId, -1, "__calendarUrl__")
      .then(doc => {
        if (doc?.calendarUrl && !readCalendarUrl()) {
          writeCalendarUrl(doc.calendarUrl);
          setCalendarUrl(doc.calendarUrl);
        }
      })
      .catch(() => {});
  }, [activeTeacherId]);

  const handleSaveCalendar = (url) => {
    writeCalendarUrl(url);
    setCalendarUrl(url);
    setCalendarEditing(false);
    // Persist globally to MongoDB so it survives clearing site data and
    // appears on ALL unit pages in every session
    if (activeTeacherId) {
      saveBoardContent(activeTeacherId, -1, "__calendarUrl__", { calendarUrl: url }).catch(() => {});
    }
  };
  const handleRemoveCalendar = () => {
    writeCalendarUrl("");
    setCalendarUrl("");
    if (activeTeacherId) {
      saveBoardContent(activeTeacherId, -1, "__calendarUrl__", { calendarUrl: "" }).catch(() => {});
    }
  };

  // A lesson's own slideshow, overriding the hardcoded curriculum
  // `lesson.slides` when a teacher has pasted one in via Build mode's
  // "+ Add Slides / Presentation" tile (see boardSlides below). Re-read
  // whenever the lesson being viewed changes, same reasoning as the
  // extraAssignments fetch below.
  const [lessonSlidesUrl, setLessonSlidesUrl] = useState(() => readLessonSlidesUrl(activeCurriculum[initialView.unitIdx]?.unit, initialView.lesson?.title));
  const [slidesEditing, setSlidesEditing] = useState(false);

  useEffect(() => {
    const local = readLessonSlidesUrl(activeUnit?.unit, activeLesson?.title);
    setLessonSlidesUrl(local);
    setSlidesEditing(false);
    // Also fetch from MongoDB so the URL survives clearing site data
    if (activeTeacherId && activeUnitIdx != null && activeLesson?.title) {
      fetchBoardContent(activeTeacherId, activeUnitIdx, activeLesson.title)
        .then(doc => {
          if (doc?.customSlidesUrl && !local) {
            writeLessonSlidesUrl(activeUnit?.unit, activeLesson.title, doc.customSlidesUrl);
            setLessonSlidesUrl(doc.customSlidesUrl);
          }
        })
        .catch(() => {}); // best-effort
    }
  }, [activeUnitIdx, activeLesson]);

  const handleSaveSlides = (url) => {
    // Persist current lesson so the post-picker window.location.reload() returns here
    try { sessionStorage.setItem("homeroom-build-reload-restore", JSON.stringify({ unitIdx: activeUnitIdx, lessonTitle: activeLesson?.title || null })); } catch {}
    writeLessonSlidesUrl(activeUnit?.unit, activeLesson?.title, url);
    setLessonSlidesUrl(url);
    setSlidesEditing(false);
    if (activeTeacherId && activeUnitIdx != null && activeLesson?.title) {
      saveBoardContent(activeTeacherId, activeUnitIdx, activeLesson.title, { customSlidesUrl: url }).catch(() => {});
    }
  };
  const handleRemoveSlides = () => {
    writeLessonSlidesUrl(activeUnit?.unit, activeLesson?.title, "");
    setLessonSlidesUrl("");
    if (activeTeacherId && activeUnitIdx != null && activeLesson?.title) {
      saveBoardContent(activeTeacherId, activeUnitIdx, activeLesson.title, { customSlidesUrl: "" }).catch(() => {});
    }
  };

  // Teacher-uploaded assignments (Cloudinary-hosted PDFs, Mongo-backed
  // metadata) layered on top of the hardcoded curriculum `assignments`
  // array for whichever lesson is currently open. Lesson view only for
  // now — Unit Overview's aggregated list doesn't include these yet.
  // Added/removed only from Build mode (handleAddAssignment/
  // handleRemoveAssignment below); a real board tab just displays them.
  const [extraAssignments, setExtraAssignments] = useState([]);
  // lessonTitle → assignment[] for the unit overview page
  const [unitExtraAssignments, setUnitExtraAssignments] = useState({});
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [addAssignmentBusy, setAddAssignmentBusy] = useState(false);
  const [addAssignmentError, setAddAssignmentError] = useState(null);

  useEffect(() => {
    if (isHome) {
      setExtraAssignments([]);
      setUnitExtraAssignments({});
      return;
    }
    if (isOverview && activeUnit) {
      // Fetch extra assignments for every lesson in this unit in parallel,
      // then store as a lessonTitle → array map for the overview grid.
      let cancelled = false;
      const lessons = activeUnit.lessons || [];
      Promise.all(
        lessons.map(l =>
          fetchExtraAssignments(activeUnitIdx, l.title)
            .then(list => ({ title: l.title, list }))
            .catch(() => ({ title: l.title, list: [] }))
        )
      ).then(results => {
        if (cancelled) return;
        const map = {};
        results.forEach(({ title, list }) => { map[title] = list; });
        setUnitExtraAssignments(map);
      });
      setExtraAssignments([]);
      return () => { cancelled = true; };
    }
    if (!activeLesson) {
      setExtraAssignments([]);
      return;
    }
    let cancelled = false;
    fetchExtraAssignments(activeUnitIdx, activeLesson.title)
      .then(list => { if (!cancelled) setExtraAssignments(list); })
      .catch(err => {
        console.error("Failed to load extra assignments", err);
        if (!cancelled) setExtraAssignments([]);
      });
    return () => { cancelled = true; };
  }, [activeUnitIdx, activeLesson, activeUnit, isHome, isOverview]);

  const handleAddAssignment = async ({ label, file, driveResult }) => {
    setAddAssignmentBusy(true);
    setAddAssignmentError(null);
    try {
      let url, thumbUrl, cloudinaryPublicId;
      if (driveResult) {
        // Drive path — file already lives in the teacher's Drive; just
        // store the viewer URL and thumbnail directly, no Cloudinary upload.
        url = driveResult.viewUrl;
        thumbUrl = driveResult.thumbUrl;
        // cloudinaryPublicId intentionally omitted for Drive picks
      } else {
        // Local file path — upload to Cloudinary as before.
        const result = await uploadAssignmentPdf(file);
        url = result.pdfUrl;
        thumbUrl = result.thumbUrl;
        cloudinaryPublicId = result.publicId;
      }
      const saved = await createExtraAssignment({
        unitIdx: activeUnitIdx, lessonTitle: activeLesson.title, label,
        url, thumb: thumbUrl,
        ...(cloudinaryPublicId ? { cloudinaryPublicId } : {}),
      });
      setExtraAssignments(prev => [...prev, saved]);
      setAddAssignmentOpen(false);
    } catch (err) {
      console.error("Failed to add assignment", err);
      setAddAssignmentError(err.message || "Something went wrong saving that assignment.");
    } finally {
      setAddAssignmentBusy(false);
    }
  };

  // Drive-only save path: called from AddAssignmentCard.onDrivePick.
  // Intentionally skips ALL React state updates so that no re-render
  // happens into the Google Picker SDK's corrupted DOM. The iframe is
  // reloaded by BuildPage immediately after this resolves, so state is
  // fetched fresh and the new assignment appears automatically.
  const handleAddAssignmentFromDrive = async ({ label, driveResult }) => {
    await createExtraAssignment({
      unitIdx: activeUnitIdx,
      lessonTitle: activeLesson?.title,
      label,
      url: driveResult.viewUrl,
      thumb: driveResult.thumbUrl,
    });
  };

  // An uploaded assignment shows up in two places: the lesson page
  // (extraAssignments) and the unit overview (unitExtraAssignments, keyed
  // by lesson title). Both are views of the SAME Mongo document, so an
  // edit has to land in both or the two screens disagree until the next
  // refetch -- which is what made renames look like they hadn't saved.
  const findAssignmentById = (id) =>
    extraAssignments.find(a => a.id === id) ||
    Object.values(unitExtraAssignments).flat().find(a => a.id === id);

  const patchAssignmentLocally = (id, fields) => {
    const apply = list => list.map(a => (a.id === id ? { ...a, ...fields } : a));
    setExtraAssignments(prev => apply(prev));
    setUnitExtraAssignments(prev => {
      const next = {};
      for (const title of Object.keys(prev)) next[title] = apply(prev[title]);
      return next;
    });
  };

  const handleRenameAssignment = async (id, newLabel) => {
    // Captured BEFORE the optimistic write so the revert has something real
    // to go back to (the previous version read a.label off the already-
    // updated item, so a failed rename silently kept the new name).
    const previousLabel = findAssignmentById(id)?.label;
    patchAssignmentLocally(id, { label: newLabel });
    try {
      await updateExtraAssignment(id, { label: newLabel });
    } catch (err) {
      console.error("Failed to rename assignment", err);
      if (previousLabel !== undefined) patchAssignmentLocally(id, { label: previousLabel });
    }
  };

  // Hidden is stored on the assignment document, so hiding one from either
  // screen hides it on both -- and on the live board, which filters them
  // out at render.
  // Drag-to-reorder for the lesson page's assignment grid. Mirrors the
  // lesson reorder in TopBar: a live copy of the list is shuffled while the
  // pointer moves so the teacher sees the result before dropping, and only
  // the drop writes anything.
  const [dragAssignmentId, setDragAssignmentId] = useState(null);
  const [dragAssignmentOrder, setDragAssignmentOrder] = useState(null);

  const assignmentDragProps = (a, list) => ({
    draggable: true,
    onDragStart: e => { e.stopPropagation(); setDragAssignmentId(a.id); setDragAssignmentOrder(list); e.dataTransfer.effectAllowed = "move"; },
    onDragOver: e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragAssignmentId || !dragAssignmentOrder || a.id === dragAssignmentId) return;
      const next = [...dragAssignmentOrder];
      const from = next.findIndex(x => x.id === dragAssignmentId);
      const to = next.findIndex(x => x.id === a.id);
      if (from === -1 || to === -1) return;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setDragAssignmentOrder(next);
    },
    onDrop: e => { e.preventDefault(); commitAssignmentOrder(); },
    // Covers dropping outside any card, which fires dragend but never drop.
    onDragEnd: () => commitAssignmentOrder(),
  });

  const commitAssignmentOrder = async () => {
    const finalOrder = dragAssignmentOrder;
    setDragAssignmentId(null);
    setDragAssignmentOrder(null);
    if (!finalOrder) return;
    const previous = extraAssignments;
    setExtraAssignments(finalOrder);
    // Keep the unit overview's copy in step so both screens agree before
    // either refetches -- same reason renames update both.
    if (activeLesson?.title) {
      setUnitExtraAssignments(prev => (prev[activeLesson.title] ? { ...prev, [activeLesson.title]: finalOrder } : prev));
    }
    try {
      await reorderExtraAssignments(finalOrder.map(x => x.id));
    } catch (err) {
      console.error("Failed to save assignment order", err);
      setExtraAssignments(previous);
    }
  };

  const handleToggleAssignmentHidden = async (id) => {
    const current = findAssignmentById(id);
    if (!current) return;
    const nextHidden = !current.hidden;
    patchAssignmentLocally(id, { hidden: nextHidden });
    try {
      await updateExtraAssignment(id, { hidden: nextHidden });
    } catch (err) {
      console.error("Failed to change assignment visibility", err);
      patchAssignmentLocally(id, { hidden: current.hidden });
    }
  };

  const handleRemoveAssignment = async (id) => {
    const previous = extraAssignments;
    setExtraAssignments(prev => prev.filter(a => a.id !== id));
    try {
      await deleteExtraAssignment(id);
    } catch (err) {
      console.error("Failed to remove assignment", err);
      setExtraAssignments(previous);
    }
  };

  // Build-mode-only: tell the parent (BuildPage.jsx) how tall the full
  // page actually is, so it can size the embedded iframe to match instead
  // of cropping it to a fixed box. Settings' preview gets away with a
  // fixed short box because it's just a glance at the board; Build needs
  // the WHOLE page reachable — the assignments grid and video library
  // live below the fold on a real board tab too, and that's exactly where
  // "+ Add Assignment" and per-item remove controls live. This is safe
  // now that oneScreenHeight above is a fixed 900px reference rather than
  // 100vh — the measured height here no longer depends on whatever height
  // the iframe currently happens to be, so feeding it back to resize the
  // iframe doesn't loop (an earlier version of this tied the board area
  // to 100vh directly, which did loop — see the comment on
  // oneScreenHeight). Re-measures via a ResizeObserver on the document
  // body, which catches lesson navigation, an add/remove form opening,
  // assignment thumbnails finishing loading, or anything else that
  // changes the page's height.
  useEffect(() => {
    if (!isBuildMode || typeof ResizeObserver === "undefined") return;
    // Debounce the report by 250 ms so that transient layout spikes during
    // Google Slides iframe load (or any other async content settling) don't
    // inflate the BuildPage wrapper to a huge height that then requires
    // scrolling to get back to the top.
    let timer = null;
    const report = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Measure the app root, NOT documentElement. The Google Picker
        // appends its dialog and backdrop to document.body, outside
        // #root, and those are tall -- reporting documentElement's
        // scrollHeight let the picker balloon the iframe, which BuildPage
        // dutifully grew to match. That is the slab of black space under
        // the footer when a teacher opens "Browse Google Drive", and it
        // outlived the picker because the SDK leaves DOM behind on close.
        const root = document.getElementById("root");
        window.parent?.postMessage(
          { type: "homeroom-build-content-height", height: (root || document.documentElement).scrollHeight },
          window.location.origin
        );
      }, 250);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(document.body);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  const toggleGoal = (panelKey, idx) => {
    const key = `${panelKey}-${idx}`;
    setCheckedGoals(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLessonClick = (unitIdx, lesson) => {
    setActiveUnitIdx(unitIdx);
    setActiveLesson(lesson);
    setOpenDropdown(null);
  };

  const handleUnitOverview = (idx) => {
    setActiveUnitIdx(idx);
    setActiveLesson(null);
    setOpenDropdown(null);
  };

  // Blank-shell + Build-mode only (see the "+ Add Unit"/"+ Add Lesson"
  // controls in TopBar) — appends a new unit/lesson to blankUnits and
  // persists it. Best-effort save: if it fails, the new unit/lesson still
  // shows locally for the rest of this session (same as the rest of
  // Build's "changes save automatically" controls assume success rather
  // than surfacing a save-failed state for every click).
  const handleAddUnit = (title) => {
    const next = [...blankUnits, { unit: title, overview: [], lessons: [] }];
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  const handleAddLesson = (unitIdx, title) => {
    const newLesson = { title, slides: null, goals: [], assignments: [], videos: [] };
    const next = blankUnits.map((u, i) => i === unitIdx ? { ...u, lessons: [...u.lessons, newLesson] } : u);
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  // ── Rename / delete / reorder units ────────────────────────────────────
  const handleRenameUnit = (unitIdx, newTitle) => {
    if (!newTitle.trim()) return;
    const next = blankUnits.map((u, i) => i === unitIdx ? { ...u, unit: newTitle.trim() } : u);
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleDeleteUnit = (unitIdx) => {
    const next = blankUnits.filter((_, i) => i !== unitIdx);
    setBlankUnits(next);
    if (activeUnitIdx === unitIdx) {
      setActiveUnitIdx(null);
      setActiveLesson(null);
    } else if (activeUnitIdx > unitIdx) {
      setActiveUnitIdx(activeUnitIdx - 1);
    }
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleMoveUnit = (unitIdx, direction) => {
    const next = [...blankUnits];
    const swapIdx = unitIdx + direction;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[unitIdx], next[swapIdx]] = [next[swapIdx], next[unitIdx]];
    setBlankUnits(next);
    if (activeUnitIdx === unitIdx) setActiveUnitIdx(swapIdx);
    else if (activeUnitIdx === swapIdx) setActiveUnitIdx(unitIdx);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  // ── Rename / delete / reorder lessons ──────────────────────────────────
  const handleRenameLesson = (unitIdx, lessonIdx, newTitle) => {
    if (!newTitle.trim()) return;
    const oldTitle = blankUnits[unitIdx]?.lessons[lessonIdx]?.title;
    const next = blankUnits.map((u, i) => {
      if (i !== unitIdx) return u;
      return { ...u, lessons: u.lessons.map((l, li) => li === lessonIdx ? { ...l, title: newTitle.trim() } : l) };
    });
    setBlankUnits(next);
    if (activeUnitIdx === unitIdx && activeLesson?.title === oldTitle) {
      setActiveLesson(prev => prev ? { ...prev, title: newTitle.trim() } : prev);
    }
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleDeleteLesson = (unitIdx, lessonIdx) => {
    const oldTitle = blankUnits[unitIdx]?.lessons[lessonIdx]?.title;
    const next = blankUnits.map((u, i) => {
      if (i !== unitIdx) return u;
      return { ...u, lessons: u.lessons.filter((_, li) => li !== lessonIdx) };
    });
    setBlankUnits(next);
    if (activeUnitIdx === unitIdx && activeLesson?.title === oldTitle) {
      setActiveLesson(null);
    }
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleMoveLesson = (unitIdx, lessonIdx, direction) => {
    const next = blankUnits.map((u, i) => {
      if (i !== unitIdx) return u;
      const lessons = [...u.lessons];
      const swapIdx = lessonIdx + direction;
      if (swapIdx < 0 || swapIdx >= lessons.length) return u;
      [lessons[lessonIdx], lessons[swapIdx]] = [lessons[swapIdx], lessons[lessonIdx]];
      return { ...u, lessons };
    });
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleSetLessonOrder = (unitIdx, orderedLessons) => {
    const next = blankUnits.map((u, i) => i === unitIdx ? { ...u, lessons: orderedLessons } : u);
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };
  const handleReorderLesson = (unitIdx, fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const next = blankUnits.map((u, i) => {
      if (i !== unitIdx) return u;
      const lessons = [...u.lessons];
      const [moved] = lessons.splice(fromIdx, 1);
      lessons.splice(toIdx, 0, moved);
      return { ...u, lessons };
    });
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  const handleToggleLessonVisibility = (unitIdx, lessonIdx) => {
    const next = blankUnits.map((u, i) => i !== unitIdx ? u : {
      ...u,
      lessons: u.lessons.map((l, j) => j === lessonIdx ? { ...l, hidden: !l.hidden } : l),
    });
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  const handleToggleUnitVisibility = (unitIdx) => {
    const next = blankUnits.map((u, i) => i === unitIdx ? { ...u, hidden: !u.hidden } : u);
    setBlankUnits(next);
    saveCurriculum(activeTeacherId, next).catch(() => {});
  };

  // All assignments across the unit in order
  const allAssignments = isHome ? [] : activeUnit.lessons.flatMap(l =>
    l.assignments.map(a => ({ ...a, lessonTitle: l.title }))
  );

  const boardSlides = isHome ? null : (isOverview ? (isBlankTeacher ? (calendarUrl || null) : CALENDAR_SRC) : (lessonSlidesUrl || activeLesson?.slides));
  const boardTitle = isHome ? null : (isOverview ? activeUnit.title : activeLesson?.title);

  // A lesson's own slides slot (Add tile when empty, its editing form, or
  // the filled slot with Build mode's Change/Remove toolbar) — shared by
  // BOTH the flat (non-sliding) column's slidesNode below AND
  // ChalkboardBoardRow's SmartBoard slot (via its renderSlidesArea prop),
  // rather than each having its own copy. Has to live up here, not inside
  // either render branch, so both can call it. Without sharing this, a
  // lesson with Sliding Boards on had no way to ever add, change, or
  // remove its slides — the sliding rail always rendered a bare SmartBoard
  // with whatever boardSlides happened to be (null included), which is
  // what silently produced an empty slide frame with no add button (Jay:
  // "There is not add presentation button").
  // Shared button style matching BuildEditableSlot's Change/Remove buttons.
  const _slotBtnStyle = { background: "rgba(20,20,20,0.9)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 3, color: "white", fontFamily: "Oswald, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 10px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.5)", transition: "border-color 0.15s" };

  const renderLessonSlides = () => {
    if (!isOverview && isBuildMode && !boardSlides) {
      // No slides yet — keep the SmartBoard frame visible (empty) so the
      // layout stays intact, and overlay an "Add Slides" button on top.
      // When the form is open it appears as a centred overlay over the board.
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <SmartBoard src={null} />
          {slidesEditing ? (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, borderRadius: 8 }}>
              <AddSlidesCard
                open={true}
                initialUrl=""
                onOpen={() => {}}
                onCancel={() => setSlidesEditing(false)}
                onSave={handleSaveSlides}
              />
            </div>
          ) : (
            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 5, pointerEvents: "auto" }}>
              <button
                data-tour="tour-add-slides"
                style={_slotBtnStyle}
                onClick={() => setSlidesEditing(true)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--board-secondary)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
              >
                Add Slides
              </button>
            </div>
          )}
        </div>
      );
    }
    if (!isOverview && isBuildMode && slidesEditing) {
      return (
        <AddSlidesCard
          open={true}
          initialUrl={lessonSlidesUrl}
          onOpen={() => {}}
          onCancel={() => setSlidesEditing(false)}
          onSave={handleSaveSlides}
        />
      );
    }
    if (!isOverview && isBuildMode) {
      return (
        <BuildEditableSlot onChange={() => setSlidesEditing(true)} onRemove={handleRemoveSlides}>
          <SmartBoard src={boardSlides} />
        </BuildEditableSlot>
      );
    }
    // Live board only (every isBuildMode branch above already returned) --
    // wrap SmartBoard in a positioned box so the Kami overlay, in its
    // "overlay" state, can sit exactly over it at the same size, replacing
    // the slides in place rather than floating over the whole page. Its
    // "fullscreen" state still escapes to position:fixed (see KamiOverlay)
    // so Full Screen still fills the viewport from here.
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <SmartBoard src={boardSlides} />
        {kamiState && (
          <KamiOverlay
            url={kamiOverlayUrl}
            state={kamiState}
            contained={kamiState !== "fullscreen"}
            onToggleFullscreen={() => setKamiState(prev => prev === "fullscreen" ? "overlay" : "fullscreen")}
            onClose={() => { setKamiState(null); setKamiSourcePanelIdx(null); }}
          />
        )}
      </div>
    );
  };

  // The active lesson's goals, flattened to one flat list of
  // { text, panelKey, idx } — same shape/keys the Learning Goals checklist
  // and the sliding chalkboard (ChalkboardBoardRow) already use for
  // checkedGoals/toggleGoal. Handles both a plain `goals` lesson and a
  // multi-panel `goalPanels` lesson (Unit 10). Full Agenda's Objectives &
  // Benchmarks section renders this same list/state directly, rather than
  // being a separate field, so a teacher never has to enter the same
  // objectives twice under two different labels.
  const goalItems = (!isOverview && activeLesson)
    ? (activeLesson.goalPanels
        ? toGoalPanels(activeLesson).flatMap((panel, pi) => {
            const panelKey = panel.label || `panel-${pi}`;
            return panel.goals.map((text, idx) => ({ text, panelKey, idx }));
          })
        : (activeLesson.goals || []).map((text, idx) => ({ text, panelKey: activeLesson.title, idx })))
    : [];

  // True when this lesson has no curriculum-authored Learning Goals at
  // all (no goalPanels, no goals array) — i.e. every blank-shell lesson
  // a non-DEFAULT_TEACHER_ID teacher sees, plus any real lesson nobody
  // has filled in goals for yet. For these, Learning Goals switches from
  // the read-only ObjectivesChecklist to the same click-to-edit,
  // itemized-checkbox field Agenda already has (see EditableField /
  // FULL_AGENDA_FIELD_META in FullAgendaBoard.jsx) — a teacher can type
  // their own goals instead of the section just sitting empty forever.
  // Lessons with real curriculum goals keep the checklist unchanged.
  const useEditableLearningGoals = !isOverview && !!activeLesson && !activeLesson.goalPanels && (!activeLesson.goals || activeLesson.goals.length === 0);

  // Whether ChalkboardBoardRow needs an extraContent/renderReset callback
  // at all — either one of the four Full Agenda freeform fields is on,
  // or Learning Goals itself is going through the editable-field path
  // (in which case it also needs to render via extraContent rather than
  // ChalkboardBoardRow's built-in goals-checklist rendering).
  const anyExtraContentOn = anyFullAgendaFieldOn || (useEditableLearningGoals && learningGoalsIsOn);

  // The actual set of boards ChalkboardBoardRow will render for the
  // current lesson — computed once here (rather than inline at the call
  // site below) so preview mode can also report its *length* back to
  // Settings. Always exactly the Number of Boards setting
  // (buildSlidingPanels in boardConfig.js always returns exactly that
  // many panels now, goals or no goals — see its own comment) and
  // deliberately does NOT depend on whether Learning Goals itself is
  // toggled on: the board count is its own independent setting (Board
  // Content > Number of Boards), and a teacher may well want several
  // sliding boards to hold Agenda/Bell Ringer/Home Learning content even
  // with Learning Goals switched off. The one exception is a lesson that
  // authors its own explicit goalPanels (Unit 10's Testing lessons),
  // which keeps its real multi-panel layout regardless of the setting.
  const slidingPanelsForLesson = (!isOverview && activeLesson)
    ? (activeLesson.goalPanels
        ? toGoalPanels(activeLesson)
        : buildSlidingPanels(goalItems, slidingCount))
    : [];

  // Preview- and Build-mode: tell Settings (or Build's own merged
  // BoardSettingsPanel) how many boards this lesson actually resolved to,
  // so it can explain a count setting that looks like it did nothing (see
  // the comment on slidingPanelsForLesson above) instead of leaving a
  // teacher to assume Sliding Boards is broken.
  const isSlidingActive = !isOverview && (activeLesson?.goalPanels || slidingEnabled);
  useEffect(() => {
    if (!isPreviewMode && !isBuildMode) return;
    window.parent?.postMessage({
      type: "homeroom-preview-panel-count",
      requestedCount: activeLesson?.goalPanels ? null : slidingCount,
      resolvedCount: isSlidingActive ? slidingPanelsForLesson.length : null,
    }, window.location.origin);
  }, [isSlidingActive, slidingPanelsForLesson.length, slidingCount, activeLesson]);

  // Full Agenda's freeform fields (Essential Question, Agenda, Bell
  // Ringer, Home Learning) — a SINGLE hook instance owning that state, so
  // whether Full Agenda is currently showing as a flat board or as
  // multiple sliding panels (ChalkboardBoardRow's extraContent, rendered
  // once per panel face), every render reads/writes the exact same
  // content instead of drifting out of sync. See useFullAgendaFields in
  // FullAgendaBoard.jsx. Called unconditionally (rules of hooks) with a
  // safe fallback key when there's no active lesson yet. The second
  // argument scopes this lesson's content to Mongo too (null at the
  // overview, where there's no lesson to scope it to) — see the
  // `mongoKey` param on useFullAgendaFields for why this is what lets a
  // teacher's Essential Question/Agenda/Bell Ringer/Home Learning text
  // survive a different browser or a cleared cache, instead of living
  // only in this one browser's localStorage.
  // Unit-level hook — owns only the Essential Question, shared across
  // every lesson and every sliding panel in the unit.
  const unitAgendaKey = scopedKey(`unitContent:u${activeUnitIdx ?? "none"}`);
  const unitFields = useFullAgendaFields(unitAgendaKey, null);

  // Flat (non-sliding) board hook — same key as the old single hook so
  // any content a teacher already entered is preserved without migration.
  const lessonKey = activeLesson?.title || "none";
  const flatMongoKey = activeLesson && activeUnitIdx != null
    ? { teacherId: activeTeacherId, unitIdx: activeUnitIdx, lessonTitle: activeLesson.title }
    : null;
  const flatPanelFields = useFullAgendaFields(
    scopedKey(`fullAgenda:${lessonKey}`), flatMongoKey
  );

  // Per-panel hooks — one per possible panel slot, always the same number
  // and unconditional, so hooks are never called conditionally. Each
  // panel's Agenda / Bell Ringer / Home Learning / Learning Goals is
  // stored under its own key, so sliding board 1 and board 2 always carry
  // their own independent content regardless of which panel is in front.
  //
  // MAX_PANELS must be >= the largest count SLIDING_BOARDS_COUNT_OPTIONS
  // offers (boardConfig.js), because the lookups below clamp with
  // Math.min(panelIdx, MAX_PANELS - 1). This was 4 while the settings
  // panel offered 5: board 5 clamped onto board 4's record, so the two
  // shared one set of Learning Goals / Agenda and editing either showed
  // up on both (Jay: "added to slide 4 it duplicated those to slide 5").
  // If a new option is added there, add a matching hook here.
  const MAX_PANELS = 5;
  const slidingPanelMongoBase = activeLesson && activeUnitIdx != null
    ? { teacherId: activeTeacherId, unitIdx: activeUnitIdx, lessonTitle: activeLesson.title }
    : null;
  const p0Fields = useFullAgendaFields(scopedKey(`fullAgenda:${lessonKey}:panel:0`), slidingPanelMongoBase ? { ...slidingPanelMongoBase, panelIdx: 0 } : null);
  const p1Fields = useFullAgendaFields(scopedKey(`fullAgenda:${lessonKey}:panel:1`), slidingPanelMongoBase ? { ...slidingPanelMongoBase, panelIdx: 1 } : null);
  const p2Fields = useFullAgendaFields(scopedKey(`fullAgenda:${lessonKey}:panel:2`), slidingPanelMongoBase ? { ...slidingPanelMongoBase, panelIdx: 2 } : null);
  const p3Fields = useFullAgendaFields(scopedKey(`fullAgenda:${lessonKey}:panel:3`), slidingPanelMongoBase ? { ...slidingPanelMongoBase, panelIdx: 3 } : null);
  const p4Fields = useFullAgendaFields(scopedKey(`fullAgenda:${lessonKey}:panel:4`), slidingPanelMongoBase ? { ...slidingPanelMongoBase, panelIdx: 4 } : null);
  const allPanelFields = [p0Fields, p1Fields, p2Fields, p3Fields, p4Fields];

  // Every panel lookup goes through here rather than clamping inline, so
  // that running off the end of allPanelFields SAYS SO instead of silently
  // aliasing two boards onto one record -- the exact failure mode of the
  // old MAX_PANELS = 4 (see its comment above). A lesson may author its
  // own goalPanels (toGoalPanels) with no regard for the setting's range,
  // so this can still be hit by curriculum data; the clamp keeps the board
  // rendering, and the warning says a hook is missing.
  const panelFieldsAt = (panelIdx) => {
    if (panelIdx >= MAX_PANELS && import.meta.env.DEV) {
      console.warn(`[Homeroom] Board ${panelIdx + 1} has no content slot of its own (MAX_PANELS=${MAX_PANELS}) and is sharing board ${MAX_PANELS}'s. Add a p${MAX_PANELS}Fields hook.`);
    }
    return allPanelFields[Math.min(panelIdx, MAX_PANELS - 1)];
  };

  // Merge a panel's fields with the unit-level Essential Question.
  const mergePanelWithUnit = (pf) => ({
    ...pf,
    content: { ...pf.content, essentialQuestion: unitFields.content.essentialQuestion },
    save: (key, value) => key === "essentialQuestion" ? unitFields.save(key, value) : pf.save(key, value),
    setEditingKey: (k) => { pf.setEditingKey(k); unitFields.setEditingKey(k); },
    editingKey: pf.editingKey || unitFields.editingKey,
  });

  // fullAgendaFields is used by the flat (non-sliding) layout and by the
  // Reset Board button and Edit fields in the flat content column. It
  // always refers to the flat per-lesson key so existing content is kept.
  const fullAgendaFields = mergePanelWithUnit(flatPanelFields);

  // The Kami URL the overlay should show -- the sliding board keeps a
  // separate Bell Ringer link per panel (allPanelFields), so once a panel's
  // Bell Ringer has been tapped (kamiSourcePanelIdx set in that panel's own
  // onKamiOpen, below) this reads that panel's link instead of always
  // falling back to the flat layout's fullAgendaFields.
  const kamiOverlayUrl = (kamiSourcePanelIdx != null
    ? mergePanelWithUnit(panelFieldsAt(kamiSourcePanelIdx)).content.bellRingerKamiUrl
    : fullAgendaFields.content.bellRingerKamiUrl) || "";

  const goHome = () => { setActiveUnitIdx(null); setActiveLesson(null); setOpenDropdown(null); };
  const topBarProps = {
    curriculum: activeCurriculum, activeUnitIdx, isOverview, activeLesson, openDropdown, setOpenDropdown, handleUnitOverview, handleLessonClick, goHome,
    titleMain: boardTitleMain, titleAccent: boardTitleAccent,
    isBlankTeacher, onAddUnit: handleAddUnit, onAddLesson: handleAddLesson,
    onRenameUnit: handleRenameUnit, onDeleteUnit: handleDeleteUnit, onMoveUnit: handleMoveUnit,
    onRenameLesson: handleRenameLesson, onDeleteLesson: handleDeleteLesson, onMoveLesson: handleMoveLesson, onReorderLesson: handleReorderLesson, onSetLessonOrder: handleSetLessonOrder,
    onToggleUnitVisibility: handleToggleUnitVisibility,
    onToggleLessonVisibility: handleToggleLessonVisibility,
  };

  // On a real board tab, "one screen" legitimately means the teacher's
  // actual browser window (100vh) — the board fills their real monitor.
  // Inside an embedded copy (Settings' preview, or Build), the iframe's
  // OWN height is something WE assign from code, so tying "one screen" to
  // 100vh there means it's tied to whatever we last set the iframe's
  // height to — which Build needs to do based on the page's real content
  // height (see the postMessage effect below), and that combination is a
  // feedback loop: grow the iframe → 100vh grows → the "one screen" board
  // region grows → measured content height grows → grow the iframe more
  // → ... (this actually happened during development — the iframe ballooned
  // to a nonsensical size in one pass). Pinning "one screen" to a fixed
  // pixel reference inside these embedded copies breaks that loop: it no
  // longer depends on whatever height the iframe happens to have.
  const oneScreenHeight = (isPreviewMode || isBuildMode) ? "900px" : "100vh";

  return (
    <div onClick={() => setOpenDropdown(null)}
      style={isHome
        ? { ...themeVars, background: "var(--board-primary)", height: oneScreenHeight, fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }
        : { ...themeVars, ...wallStyle, minHeight: oneScreenHeight, fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column", ...highlightStyle("background") }
      }>



      {isHome ? (
        <>
          <TopBar {...topBarProps} />
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--board-primary)" }}>
            {isBlankTeacher ? (
              <div style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Oswald, sans-serif", fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>
                {activeCurriculum.length === 0
                  ? "No units yet — add your first one above to get started"
                  : "No content yet — pick a unit above to start adding assignments"}
              </div>
            ) : (
              <div style={{ height: "100%", aspectRatio: "2.1", overflow: "hidden" }}>
                <img
                  src="/images/wghs-building.jpg"
                  alt="Webster Groves High School"
                  style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
                />
              </div>
            )}
          </div>
        </>
      ) : (
      <>
      {/* ── First screen: nav + board fill exactly one viewport; assignments live below the fold ── */}
      <div style={{ height: oneScreenHeight, flexShrink: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
        <TopBar {...topBarProps} />

        {/* Room */}
        <div style={{ flex: 1, minHeight: 0, padding: SPACE.lg, maxWidth: 1700, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

          {/* Board unit */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "7px solid #8B6914", borderRadius: 5, overflow: "hidden", boxShadow: "0 4px 18px rgba(0,0,0,0.35)" }}>

            {/* Bulletin strip — background + optional decorative dot-trim
                along the top/bottom edges, both driven by the selected
                BULLETIN_STYLES preset. */}
            <div style={{ background: bulletinStyle.background, position: "relative", minHeight: 112, flexShrink: 0, display: "flex", flexDirection: "column", ...highlightStyle("bulletin") }}>
              {bulletinStyle.trim && (
                <div style={{ height: 10, flexShrink: 0, backgroundImage: bulletinStyle.trim, backgroundRepeat: "repeat-x", backgroundSize: "24px 10px" }} />
              )}
              <div style={{ flex: 1 }} />
              {bulletinStyle.trim && (
                <div style={{ height: 10, flexShrink: 0, backgroundImage: bulletinStyle.trim, backgroundRepeat: "repeat-x", backgroundSize: "24px 10px" }} />
              )}
            </div>

            {/* Chalkboard */}
            <div style={{ flex: 1, minHeight: 0, background: surface.face, borderTop: "4px solid #6B4F10", display: "flex", flexDirection: "column", ...highlightStyle("blackboard"), ...highlightStyle("content") }}>
              {!isOverview && (activeLesson?.goalPanels || slidingEnabled) ? (
                // Sliding multi-panel chalkboard — the exact same rail/dock
                // mechanic regardless of content template. A lesson that
                // authors its own explicit `goalPanels` (currently just
                // Unit 10's Testing lessons) always uses those panels as-is.
                // Every other lesson uses this when the Sliding Boards
                // setting is on, auto-splitting its flat goals list into
                // slidingCount panels (see buildSlidingPanels in
                // boardConfig.js). Under Full Agenda, each panel also
                // carries the Essential Question/Agenda/Bell Ringer/Home
                // Learning fields via extraContent (see FullAgendaBoard.jsx
                // — a single hook-owned content instance, not duplicated
                // per panel) so the whole board slides as one unit, same as
                // Learning Goals always has.
                <ChalkboardBoardRow
                  smartBoardSrc={boardSlides}
                  renderSlidesArea={renderLessonSlides}
                  isOverview={false}
                  overviewItems={[]}
                  onOverviewItemClick={() => {}}
                  panels={slidingPanelsForLesson}
                  checkedGoals={checkedGoals}
                  toggleGoal={toggleGoal}
                  SmartBoard={SmartBoard}
                  arrangement={arrangement}
                  surface={surface}
                  showGoals={learningGoalsIsOn && !useEditableLearningGoals}
                  learningGoalsEditable={useEditableLearningGoals}
                  goalsLabel={anyFullAgendaFieldOn ? "Objectives & Benchmarks" : "Learning Goals"}
                  goalsHeaderColor={anyFullAgendaFieldOn ? surface.accent : surface.headerText}
                  // Same boardContentOrder the flat (non-sliding) column
                  // uses (see its own comment further down) — this is what
                  // lets a teacher's drag-to-reorder in the Board Content
                  // settings panel actually take effect while Sliding
                  // Boards is on, instead of Essential Question/Agenda/Bell
                  // Ringer/Home Learning always rendering in one fixed
                  // sequence regardless of what's been dragged where.
                  contentOrder={boardContentOrder}
                  renderReset={anyExtraContentOn ? (isFront, panelIdx) => {
                    const pf = mergePanelWithUnit(panelFieldsAt(panelIdx));
                    return <ResetBoardButton onReset={pf.resetToDefaults} surface={surface} interactive={isFront && isBuildMode} />;
                  } : null}
                  extraContent={anyExtraContentOn ? (key, isFront, panelIdx) => {
                    // Each panel bakes in its OWN content, keyed by panelIdx,
                    // so board 1's text stays on board 1 while it slides away
                    // and board 2's own content is revealed underneath.
                    const pf = mergePanelWithUnit(panelFieldsAt(panelIdx));
                    if (key === "learningGoals") {
                      if (!useEditableLearningGoals || !learningGoalsIsOn) return null;
                      return (
                        <EditableField
                          key={key}
                          fieldKey="learningGoals"
                          content={pf.content}
                          editingKey={pf.editingKey}
                          onStartEdit={pf.setEditingKey}
                          onSave={pf.save}
                          surface={surface}
                          interactive={isFront && isBuildMode}
                          checkedLines={pf.checkedLearningGoalsLines}
                          onToggleLine={pf.toggleLearningGoalsLine}
                        />
                      );
                    }
                    const isOnByKey = { essentialQuestion: essentialQuestionIsOn, agenda: agendaIsOn, bellRinger: bellRingerIsOn, homeLearning: isBuildMode && homeLearningIsOn };
                    if (!isOnByKey[key]) return null;
                    return (
                      <EditableField
                        key={key}
                        fieldKey={key}
                        content={pf.content}
                        editingKey={pf.editingKey}
                        onStartEdit={pf.setEditingKey}
                        onSave={pf.save}
                        surface={surface}
                        interactive={isFront && isBuildMode}
                        checkedLines={pf.checkedAgendaLines}
                        onToggleLine={pf.toggleAgendaLine}
                        {...(key === "bellRinger" ? {
                          kamiUrl: pf.content.bellRingerKamiUrl || "",
                          onSaveKamiUrl: val => pf.save("bellRingerKamiUrl", val),
                          onKamiOpen: () => { setKamiSourcePanelIdx(panelIdx); setKamiState(prev => prev ? null : "overlay"); },
                          lessonLabel: activeLesson?.title,
                        } : {})}
                      />
                    );
                  } : null}
                />
              ) : (() => {
                // Rendered according to the selected board arrangement preset
                // (see BOARD_ARRANGEMENTS) rather than a fixed left/right
                // layout — `order` decides which side renders first, and the
                // divider follows whichever side ends up second. This same
                // grid is shared by every content template (Simple Goals,
                // Full Agenda, and Unit 10's goalPanels lessons whenever
                // Full Agenda is selected) — only what's inside the goals
                // column changes.
                const slidesNode = (
                  <div key="slides" style={{ position: "relative", minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: SPACE.md, gap: SPACE.sm }}>
                    <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%", maxWidth: "100%", display: "flex", justifyContent: "center", boxSizing: "border-box", overflow: "hidden" }}>
                      {isOverview && isBlankTeacher && !calendarUrl ? (
                        isBuildMode ? (
                          <AddCalendarCard
                            open={calendarEditing}
                            onOpen={() => setCalendarEditing(true)}
                            onCancel={() => setCalendarEditing(false)}
                            onSave={handleSaveCalendar}
                          />
                        ) : (
                          // Read-only on purpose — this is the live board,
                          // which could be projected in front of a class, so
                          // it never shows an add/edit affordance. Adding a
                          // calendar happens on the Build page (🛠 icon
                          // above) instead.
                          <div style={{ width: "100%", maxWidth: "100%", aspectRatio: "16/9", boxSizing: "border-box", border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Oswald, sans-serif", fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center", padding: SPACE.md }}>
                            No calendar added yet — add one from the Build page
                          </div>
                        )
                      ) : isOverview && isBlankTeacher && isBuildMode && calendarEditing ? (
                        <AddCalendarCard
                          open={true}
                          initialUrl={calendarUrl}
                          onOpen={() => {}}
                          onCancel={() => setCalendarEditing(false)}
                          onSave={handleSaveCalendar}
                        />
                      ) : isOverview && isBlankTeacher && isBuildMode ? (
                        <BuildEditableSlot onChange={() => setCalendarEditing(true)} onRemove={handleRemoveCalendar}>
                          <SmartBoard src={boardSlides} />
                        </BuildEditableSlot>
                      ) : (
                        renderLessonSlides()
                      )}
                    </div>

                  </div>
                );

                const goalsIsSecond = arrangement.order[1] === "goals";
                const goalsNode = (
                  <div key="goals" style={{ minWidth: 0, [goalsIsSecond ? "borderLeft" : "borderRight"]: "1px dashed rgba(255,255,255,0.18)", padding: SPACE.md, display: "flex", flexDirection: "column", gap: SPACE.xs, overflowY: "auto", overflowX: "hidden" }}>
                    {isOverview ? (
                      <>
                        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.headerText, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: SPACE.xs }}>
                          Unit Lessons
                        </div>
                        {(activeUnit.overview || []).map((item, i) => (
                          <div key={i}
                            onClick={() => { const lesson = activeUnit.lessons.find(l => l.title === item); if (lesson) setActiveLesson(lesson); }}
                            style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: activeUnit.lessons.find(l => l.title === item) ? "pointer" : "default", padding: "4px 0", borderBottom: `1px solid ${surface.dividerBorder}` }}
                          >
                            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: surface.accent, minWidth: 18, opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
                            <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: surface.bodyText, lineHeight: 1.3, textShadow: surface.textShadow, minWidth: 0, wordBreak: "break-word" }}>{item}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      // Flat (non-sliding) board content — replaces just
                      // the goals column (slides/SmartBoard stay put).
                      // Rendered in whatever order the teacher has set
                      // (boardContentOrder, from Settings' Board Content
                      // section — see BOARD_CONTENT_ORDER_STORAGE_KEY in
                      // boardConfig.js) rather than a fixed sequence; each
                      // of the five only actually renders when its own
                      // Settings toggle is on. Learning Goals reuses the
                      // same Objectives checklist Full Agenda's sliding
                      // case uses, labeled "Objectives & Benchmarks"
                      // whenever it's sharing the column with any of the
                      // other four, or plain "Learning Goals" when it's the
                      // only thing on (matching the old Simple Goals look).
                      // The four freeform fields use the SAME
                      // fullAgendaFields hook instance as the sliding case
                      // above, so switching Sliding Boards on/off never
                      // shows stale content. Reset Board is placed once, up
                      // front, rather than tied to wherever the first
                      // freeform field happens to land in the order.
                      <>
                        {anyExtraContentOn && (
                          <ResetBoardButton onReset={fullAgendaFields.resetToDefaults} surface={surface} interactive={isBuildMode} />
                        )}
                        {boardContentOrder.map(key => {
                          if (key === "learningGoals") {
                            if (!learningGoalsIsOn) return null;
                            if (useEditableLearningGoals) {
                              return (
                                <div key={key} data-tour="tour-learning-goals">
                                  <EditableField
                                    fieldKey="learningGoals"
                                    content={fullAgendaFields.content}
                                    editingKey={fullAgendaFields.editingKey}
                                    onStartEdit={fullAgendaFields.setEditingKey}
                                    onSave={fullAgendaFields.save}
                                    surface={surface}
                                    interactive={isBuildMode}
                                    checkedLines={fullAgendaFields.checkedLearningGoalsLines}
                                    onToggleLine={fullAgendaFields.toggleLearningGoalsLine}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div key={key} data-tour="tour-learning-goals">
                                <ObjectivesChecklist
                                  goalItems={goalItems}
                                  checkedGoals={checkedGoals}
                                  toggleGoal={toggleGoal}
                                  surface={surface}
                                  label={anyFullAgendaFieldOn ? "Objectives & Benchmarks" : "Learning Goals"}
                                  interactive={isBuildMode}
                                />
                              </div>
                            );
                          }
                          const isOnByKey = { essentialQuestion: essentialQuestionIsOn, agenda: agendaIsOn, bellRinger: bellRingerIsOn, homeLearning: isBuildMode && homeLearningIsOn };
                          if (!isOnByKey[key]) return null;
                          return (
                            <EditableField
                              key={key}
                              fieldKey={key}
                              content={fullAgendaFields.content}
                              editingKey={fullAgendaFields.editingKey}
                              onStartEdit={fullAgendaFields.setEditingKey}
                              onSave={fullAgendaFields.save}
                              surface={surface}
                              interactive={isBuildMode}
                              checkedLines={fullAgendaFields.checkedAgendaLines}
                              onToggleLine={fullAgendaFields.toggleAgendaLine}
                              {...(key === "bellRinger" ? {
                                kamiUrl: fullAgendaFields.content.bellRingerKamiUrl || "",
                                onSaveKamiUrl: val => fullAgendaFields.save("bellRingerKamiUrl", val),
                                lessonLabel: activeLesson?.title,
                                onKamiOpen: () => { setKamiSourcePanelIdx(null); setKamiState(prev => prev ? null : "overlay"); },
                              } : {})}
                            />
                          );
                        })}
                        {!learningGoalsIsOn && !anyFullAgendaFieldOn && (
                          <div style={{ fontFamily: "Caveat, cursive", fontSize: 17, color: surface.placeholderText, fontStyle: "italic", padding: "2px 4px" }}>
                            No board content is turned on. Turn on Learning Goals, Essential Question, Agenda, Bell Ringer, or Home Learning in Settings.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );

                const nodesByKey = { slides: slidesNode, goals: goalsNode };
                return (
                  <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: arrangement.gridTemplateColumns, columnGap: SPACE.md, ...highlightStyle("layout") }}>
                    {arrangement.order.map(k => nodesByKey[k])}
                  </div>
                );
              })()}
            </div>

            {/* Chalk ledge / marker tray — styled per the Board Surface preset. */}
            <div style={{ height: 8, background: surface.ledgeBg, borderTop: `2px solid ${surface.ledgeBorder}`, display: "flex", alignItems: "center", padding: `0 ${SPACE.sm}px`, gap: SPACE.xs }}>
              {[["#f0f0f0", 18], ["var(--board-secondary)", 18], ["#f0f0f0", 12]].map(([c, w], i) => (
                <div key={i} style={{ width: w, height: 4, borderRadius: 1, background: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Assignments — below the fold, scroll to reveal ── */}
      <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px`, maxWidth: 1700, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ background: "var(--board-primary)", border: "3px solid var(--board-secondary)", borderRadius: 4, overflow: "hidden", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
          <div style={{ background: "var(--board-secondary)", padding: `${SPACE.xs}px ${SPACE.md}px`, fontFamily: "Oswald, sans-serif", fontSize: 14, color: "var(--board-secondary-fg)", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{isOverview ? `${activeUnit.unit} — All Assignments` : "Assignments & Classwork"}</span>
            {isOverview && <span style={{ fontSize: 11, fontFamily: "Lato, sans-serif", fontWeight: 400, opacity: 0.7, letterSpacing: 0 }}>in curriculum order</span>}
          </div>
          <div style={{ padding: SPACE.sm }}>
            {isOverview ? (
              activeUnit.lessons.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20, textAlign: "center", fontStyle: "italic" }}>Content coming soon...</div>
              ) : (
                activeUnit.lessons.filter(lesson => isBuildMode || !lesson.hidden).map((lesson, li) => (
                  <div key={li}>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "var(--board-secondary-accent)", letterSpacing: 1, textTransform: "uppercase", padding: li === 0 ? `0 0 ${SPACE.xs}px` : `${SPACE.sm}px 0 ${SPACE.xs}px`, borderTop: li === 0 ? "none" : "1px solid #333" }}>
                      {lesson.title}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: SPACE.md }}>
                      {lesson.assignments.map((a, ai) => (
                        <AssignmentThumb key={ai} {...a} />
                      ))}
                      {(unitExtraAssignments[lesson.title] || []).filter(a => isBuildMode || !a.hidden).map((a) => (
                        <AssignmentThumb key={a.id} {...a}
                          onToggleHidden={isBuildMode ? () => handleToggleAssignmentHidden(a.id) : undefined} />
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: SPACE.md }}>
                {/* The "+ Add Assignment" tile and per-item remove controls
                    only ever render in Build mode (isBuildMode) — this is
                    otherwise the live board, which could be projected in
                    front of a class, so it stays a read-only display of
                    whatever's already been added. */}
                {!isBuildMode && activeLesson?.assignments.length === 0 && extraAssignments.every(a => a.hidden) && (
                  <div style={{ gridColumn: "1 / -1", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20, textAlign: "center", fontStyle: "italic" }}>No assignments yet for this lesson.</div>
                )}
                {activeLesson?.assignments.map((a, ai) => (
                  <AssignmentThumb key={`base-${ai}`} {...a} />
                ))}
                {(dragAssignmentOrder ?? extraAssignments).filter(a => isBuildMode || !a.hidden).map((a) => (
                  <AssignmentThumb key={a.id} {...a}
                    onRemove={isBuildMode ? () => handleRemoveAssignment(a.id) : undefined}
                    onRename={isBuildMode ? (newLabel) => handleRenameAssignment(a.id, newLabel) : undefined}
                    onToggleHidden={isBuildMode ? () => handleToggleAssignmentHidden(a.id) : undefined}
                    dragProps={isBuildMode ? assignmentDragProps(a, dragAssignmentOrder ?? extraAssignments) : undefined} />
                ))}
                {isBuildMode && (
                  <AddAssignmentCard
                    open={addAssignmentOpen}
                    busy={addAssignmentBusy}
                    error={addAssignmentError}
                    onOpen={() => { setAddAssignmentError(null); setAddAssignmentOpen(true); }}
                    onCancel={() => { setAddAssignmentOpen(false); setAddAssignmentError(null); }}
                    onSubmit={handleAddAssignment}
                    onDrivePick={handleAddAssignmentFromDrive}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Video library — lesson-scoped only, matches the assignments block above ── */}
      {!isOverview && (
        <VideoLibrary videos={activeLesson?.videos} playingVideoId={playingVideoId} setPlayingVideoId={setPlayingVideoId} />
      )}
      </>
      )}

      <ToolsFooter />
    </div>
  );
}
