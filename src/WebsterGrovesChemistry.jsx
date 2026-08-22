import { useState, useEffect, useRef } from "react";
import ChalkboardBoardRow, { toGoalPanels } from "./ChalkboardBoardRow";
import FullAgendaBoard from "./FullAgendaBoard";
import {
  scopedKey, useScopedSetting,
  BOARD_ARRANGEMENTS, DEFAULT_ARRANGEMENT, ARRANGEMENT_STORAGE_KEY,
  BULLETIN_STYLES, DEFAULT_BULLETIN, BULLETIN_STORAGE_KEY,
  BOARD_CONTENT_TEMPLATES, DEFAULT_CONTENT_TEMPLATE, CONTENT_TEMPLATE_STORAGE_KEY,
  GOALS_STORAGE_KEY,
  WALL_TYPES, DEFAULT_WALL_TYPE, WALL_TYPE_STORAGE_KEY,
  DEFAULT_WALL_COLOR_BY_TYPE, WALL_COLOR_STORAGE_KEY,
  wallBackgroundStyle,
  BOARD_SURFACES, DEFAULT_BOARD_SURFACE, BOARD_SURFACE_STORAGE_KEY, surfaceColors,
  SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED,
  SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT,
} from "./boardConfig";

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

// Splits a flat goalItems list (see the goalItems derivation in App())
// into N sliding-chalkboard panels, for lessons that don't author their
// own explicit `goalPanels` (i.e. every lesson except Unit 10's Testing
// lessons today). Each resulting item carries its *original* idx and a
// shared panelKey (the lesson title) rather than a fresh per-panel index,
// so checking a goal while Sliding Boards is on stays in sync with the
// same goal shown in the flat Learning Goals checklist / Full Agenda
// Objectives section when Sliding Boards is off — one shared checked-state
// namespace, not one per panel. See panel.panelKey handling in
// ChalkboardBoardRow.jsx.
function buildSlidingPanels(goalItems, count) {
  if (goalItems.length === 0) return [{ label: undefined, goals: [] }];
  const n = Math.max(1, count);
  const buckets = Array.from({ length: n }, () => []);
  goalItems.forEach((item, i) => {
    buckets[i % n].push(item);
  });
  return buckets
    .filter(b => b.length > 0)
    .map((items, i) => ({
      label: `Board ${i + 1}`,
      panelKey: items[0].panelKey,
      goals: items.map(it => ({ text: it.text, idx: it.idx })),
    }));
}

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
    <div style={{ background: "#1a1a1a", borderTop: "4px solid #E87722", padding: `${SPACE.md}px ${SPACE.lg}px`, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: SPACE.md, flexShrink: 0 }}>
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

const curriculum = [
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
        <div style={{ width: "100%", background: "#0a0a0a", borderRadius: "4px 4px 0 0", aspectRatio: "16/9", overflow: "hidden", border: "1px solid #1a1a1a" }}>
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

function AssignmentThumb({ label, url, thumb }) {
  return (
    <a href={url} target="_blank" rel="noreferrer"
      style={{ background: "white", borderRadius: 3, overflow: "hidden", cursor: "pointer", position: "relative", border: "2px solid transparent", transition: "all 0.15s", aspectRatio: "8.5/11", textDecoration: "none", display: "block" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#E87722"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.querySelector(".aLabel").style.opacity = 1; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.querySelector(".aLabel").style.opacity = 0; }}
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
      <div className="aLabel" style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(232,119,34,0.95)", color: "white", fontSize: 10, fontFamily: "Oswald, sans-serif", padding: 5, textAlign: "center", opacity: 0, transition: "opacity 0.15s", letterSpacing: 0.5 }}>
        {label}
      </div>
    </a>
  );
}

function VideoThumb({ title, id, onPlay }) {
  return (
    <button
      onClick={() => onPlay(id)}
      style={{ background: "#000", borderRadius: 3, overflow: "hidden", cursor: "pointer", position: "relative", border: "2px solid transparent", transition: "all 0.15s", aspectRatio: "16/9", display: "block", padding: 0, textAlign: "left", width: "100%" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#E87722"; e.currentTarget.style.transform = "translateY(-2px)"; }}
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
      <div style={{ background: "#1a1a1a", border: "3px solid #E87722", borderRadius: 4, overflow: "hidden", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "#E87722", padding: `${SPACE.xs}px ${SPACE.md}px`, fontFamily: "Oswald, sans-serif", fontSize: 14, color: "#1a1a1a", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>
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

function TopBar({ curriculum, activeUnitIdx, isOverview, activeLesson, openDropdown, setOpenDropdown, handleUnitOverview, handleLessonClick, goHome }) {
  return (
    <div style={{ background: "#1a1a1a", borderBottom: "4px solid #E87722", flexShrink: 0, position: "relative" }}>
      <div style={{ padding: `${SPACE.md}px ${SPACE.lg}px ${SPACE.sm}px`, textAlign: "center", position: "relative" }}>
        <div
          onClick={goHome}
          style={{ fontFamily: "Oswald, sans-serif", color: "#fff", fontSize: 26, fontWeight: 600, letterSpacing: 2, cursor: "pointer", display: "inline-block" }}
        >
          Webster Groves <span style={{ color: "#E87722" }}>Chemistry</span>
        </div>

        {/* Opens the Settings page in its own browser tab (real URL,
            /settings — see SettingsPage.jsx) rather than an in-place
            dropdown. The settings tab shows a live scaled-down preview of
            the board with categorized controls (Background, Board Layout,
            Bulletin Board, Board Content); changes made there sync back to
            this tab live via the shared localStorage keys + the browser's
            `storage` event (see useScopedSetting in boardConfig.js). */}
        <button
          onClick={e => { e.stopPropagation(); window.open("/settings", "_blank", "noopener"); }}
          title="Board settings"
          aria-label="Open board settings"
          style={{ position: "absolute", right: SPACE.lg, top: "50%", transform: "translateY(-50%)", width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#E87722"; e.currentTarget.style.color = "#1a1a1a"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#fff"; }}
        >
          ⚙
        </button>
      </div>

      {/* Unit nav */}
      <div style={{ display: "flex", borderTop: "1px solid #333" }} onClick={e => e.stopPropagation()}>
        {curriculum.map((u, ui) => (
          <div key={ui} style={{ position: "relative", flex: 1 }}
            onMouseEnter={() => u.lessons.length > 0 && setOpenDropdown(ui)}
            onMouseLeave={() => setOpenDropdown(prev => (prev === ui ? null : prev))}
          >
            <button
              onClick={() => handleUnitOverview(ui)}
              style={{ background: activeUnitIdx === ui && isOverview ? "#fff" : "#E87722", color: activeUnitIdx === ui && isOverview ? "#E87722" : "#1a1a1a", border: "none", borderRight: "1px solid rgba(0,0,0,0.2)", padding: `${SPACE.sm}px ${SPACE.xs}px`, fontSize: 13, fontFamily: "Oswald, sans-serif", cursor: "pointer", letterSpacing: 0.5, width: "100%", fontWeight: 600, transition: "all 0.15s" }}
              onMouseEnter={e => { if (!(activeUnitIdx === ui && isOverview)) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#1a1a1a"; }}}
              onMouseLeave={e => { if (!(activeUnitIdx === ui && isOverview)) { e.currentTarget.style.background = "#E87722"; e.currentTarget.style.color = "#1a1a1a"; }}}
            >
              {u.unit}
            </button>

            {/* Dropdown */}
            {openDropdown === ui && u.lessons.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, minWidth: 210, background: "#1a1a1a", border: "1px solid #E87722", borderTop: "none", borderRadius: "0 0 4px 4px", zIndex: 5000, overflow: "hidden" }}>
                {u.lessons.map((lesson, li) => (
                  <div key={li}
                    onClick={() => handleLessonClick(ui, lesson)}
                    style={{ padding: `${SPACE.sm}px ${SPACE.md}px`, fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: activeLesson?.title === lesson.title ? "#E87722" : "#ccc", cursor: "pointer", borderBottom: "1px solid #2a2a2a", transition: "all 0.12s", whiteSpace: "nowrap", borderLeft: activeLesson?.title === lesson.title ? "3px solid #E87722" : "3px solid transparent", paddingLeft: activeLesson?.title === lesson.title ? SPACE.md - 3 : SPACE.md }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#E87722"; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = activeLesson?.title === lesson.title ? "#E87722" : "#ccc"; }}
                  >
                    {lesson.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

export default function App() {
  const [activeUnitIdx, setActiveUnitIdx] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
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
  const [contentTemplateKey, setContentTemplateKey] = useScopedSetting(CONTENT_TEMPLATE_STORAGE_KEY, DEFAULT_CONTENT_TEMPLATE, k => !!BOARD_CONTENT_TEMPLATES[k]);
  const [wallTypeKey] = useScopedSetting(WALL_TYPE_STORAGE_KEY, DEFAULT_WALL_TYPE, k => !!WALL_TYPES[k]);
  const [wallColorKey] = useScopedSetting(WALL_COLOR_STORAGE_KEY, DEFAULT_WALL_COLOR_BY_TYPE[DEFAULT_WALL_TYPE], null);
  const [boardSurfaceKey] = useScopedSetting(BOARD_SURFACE_STORAGE_KEY, DEFAULT_BOARD_SURFACE, k => !!BOARD_SURFACES[k]);
  const [slidingBoardsEnabled] = useScopedSetting(SLIDING_BOARDS_ENABLED_KEY, DEFAULT_SLIDING_BOARDS_ENABLED, k => k === "true" || k === "false");
  const [slidingBoardsCount] = useScopedSetting(SLIDING_BOARDS_COUNT_KEY, DEFAULT_SLIDING_BOARDS_COUNT, k => /^[2-9]$/.test(k));

  useEffect(() => {
    window.localStorage.setItem(scopedKey(GOALS_STORAGE_KEY), JSON.stringify(checkedGoals));
  }, [checkedGoals]);

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

  const isHome = activeUnitIdx === null;
  const activeUnit = isHome ? null : curriculum[activeUnitIdx];
  const isOverview = activeLesson === null;

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

  // All assignments across the unit in order
  const allAssignments = isHome ? [] : activeUnit.lessons.flatMap(l =>
    l.assignments.map(a => ({ ...a, lessonTitle: l.title }))
  );

  const boardSlides = isHome ? null : (isOverview ? CALENDAR_SRC : activeLesson?.slides);
  const boardTitle = isHome ? null : (isOverview ? activeUnit.title : activeLesson?.title);

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

  const goHome = () => { setActiveUnitIdx(null); setActiveLesson(null); setOpenDropdown(null); };
  const topBarProps = {
    curriculum, activeUnitIdx, isOverview, activeLesson, openDropdown, setOpenDropdown, handleUnitOverview, handleLessonClick, goHome,
  };

  return (
    <div onClick={() => setOpenDropdown(null)}
      style={isHome
        ? { background: "#1a1a1a", height: "100vh", fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }
        : { ...wallStyle, minHeight: "100vh", fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column" }
      }>

      {isHome ? (
        <>
          <TopBar {...topBarProps} />
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a" }}>
            <div style={{ height: "100%", aspectRatio: "2.1", overflow: "hidden" }}>
              <img
                src="/images/wghs-building.jpg"
                alt="Webster Groves High School"
                style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
              />
            </div>
          </div>
        </>
      ) : (
      <>
      {/* ── First screen: nav + board fill exactly one viewport; assignments live below the fold ── */}
      <div style={{ height: "100vh", flexShrink: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
        <TopBar {...topBarProps} />

        {/* Room */}
        <div style={{ flex: 1, minHeight: 0, padding: SPACE.lg, maxWidth: 1700, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

          {/* Board unit */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "7px solid #8B6914", borderRadius: 5, overflow: "hidden", boxShadow: "0 4px 18px rgba(0,0,0,0.35)" }}>

            {/* Bulletin strip — background + optional decorative dot-trim
                along the top/bottom edges, both driven by the selected
                BULLETIN_STYLES preset. */}
            <div style={{ background: bulletinStyle.background, position: "relative", minHeight: 112, flexShrink: 0, display: "flex", flexDirection: "column" }}>
              {bulletinStyle.trim && (
                <div style={{ height: 10, flexShrink: 0, backgroundImage: bulletinStyle.trim, backgroundRepeat: "repeat-x", backgroundSize: "24px 10px" }} />
              )}
              <div style={{ flex: 1 }} />
              {bulletinStyle.trim && (
                <div style={{ height: 10, flexShrink: 0, backgroundImage: bulletinStyle.trim, backgroundRepeat: "repeat-x", backgroundSize: "24px 10px" }} />
              )}
            </div>

            {/* Chalkboard */}
            <div style={{ flex: 1, minHeight: 0, background: surface.face, borderTop: "4px solid #6B4F10", display: "flex", flexDirection: "column" }}>
              {!isOverview && contentTemplateKey !== "fullAgenda" && (activeLesson?.goalPanels || slidingEnabled) ? (
                // Sliding multi-panel chalkboard. A lesson that authors its
                // own explicit `goalPanels` (currently just Unit 10's
                // Testing lessons) always uses those panels as-is. Every
                // other lesson uses this when the Sliding Boards setting is
                // on, auto-splitting its flat goals list into
                // slidingCount panels (see buildSlidingPanels above). Only
                // used under the Simple Goals content template — Full
                // Agenda's Objectives section is never split into panels.
                <ChalkboardBoardRow
                  smartBoardSrc={boardSlides}
                  isOverview={false}
                  overviewItems={[]}
                  onOverviewItemClick={() => {}}
                  panels={activeLesson?.goalPanels ? toGoalPanels(activeLesson) : buildSlidingPanels(goalItems, slidingCount)}
                  checkedGoals={checkedGoals}
                  toggleGoal={toggleGoal}
                  SmartBoard={SmartBoard}
                  arrangement={arrangement}
                  surface={surface}
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
                  <div key="slides" style={{ minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: SPACE.md, gap: SPACE.sm }}>
                    <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%", maxWidth: "100%", display: "flex", justifyContent: "center", boxSizing: "border-box", overflow: "hidden" }}>
                      <SmartBoard src={boardSlides} />
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
                        {activeUnit.overview.map((item, i) => (
                          <div key={i}
                            onClick={() => { const lesson = activeUnit.lessons.find(l => l.title === item); if (lesson) setActiveLesson(lesson); }}
                            style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: activeUnit.lessons.find(l => l.title === item) ? "pointer" : "default", padding: "4px 0", borderBottom: `1px solid ${surface.dividerBorder}` }}
                          >
                            <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: surface.accent, minWidth: 18, opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
                            <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: surface.bodyText, lineHeight: 1.3, textShadow: surface.textShadow, minWidth: 0, wordBreak: "break-word" }}>{item}</span>
                          </div>
                        ))}
                      </>
                    ) : contentTemplateKey === "fullAgenda" ? (
                      // Full Agenda content template — replaces just the goals
                      // column (slides/SmartBoard stay put), same as Simple
                      // Goals does. Storage key is scoped per-lesson so each
                      // lesson (including Unit 10's goalPanels lessons) keeps
                      // its own edited board content.
                      <FullAgendaBoard
                        storageKey={scopedKey(`fullAgenda:${activeLesson.title}`)}
                        goalItems={goalItems}
                        checkedGoals={checkedGoals}
                        toggleGoal={toggleGoal}
                        surface={surface}
                      />
                    ) : (
                      <>
                        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: surface.headerText, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${surface.dividerBorder}`, paddingBottom: SPACE.xs }}>
                          Learning Goals
                        </div>
                        {activeLesson?.goals.map((goal, i) => {
                          const key = `${activeLesson.title}-${i}`;
                          const checked = checkedGoals[key];
                          return (
                            <div key={i} onClick={() => toggleGoal(activeLesson.title, i)}
                              style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                              <div style={{ width: 15, height: 15, border: `2px solid ${checked ? surface.accent : surface.checkboxBorder}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? surface.accent : "transparent", transition: "all 0.15s" }}>
                                {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                              </div>
                              <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: checked ? surface.bodyTextChecked : surface.bodyText, lineHeight: 1.35, textShadow: surface.textShadow, textDecoration: checked ? "line-through" : "none", minWidth: 0, wordBreak: "break-word" }}>
                                {goal}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );

                const nodesByKey = { slides: slidesNode, goals: goalsNode };
                return (
                  <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: arrangement.gridTemplateColumns, columnGap: SPACE.md }}>
                    {arrangement.order.map(k => nodesByKey[k])}
                  </div>
                );
              })()}
            </div>

            {/* Chalk ledge / marker tray — styled per the Board Surface preset. */}
            <div style={{ height: 8, background: surface.ledgeBg, borderTop: `2px solid ${surface.ledgeBorder}`, display: "flex", alignItems: "center", padding: `0 ${SPACE.sm}px`, gap: SPACE.xs }}>
              {[["#f0f0f0", 18], ["#E87722", 18], ["#f0f0f0", 12]].map(([c, w], i) => (
                <div key={i} style={{ width: w, height: 4, borderRadius: 1, background: c }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Assignments — below the fold, scroll to reveal ── */}
      <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px`, maxWidth: 1700, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ background: "#1a1a1a", border: "3px solid #E87722", borderRadius: 4, overflow: "hidden", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
          <div style={{ background: "#E87722", padding: `${SPACE.xs}px ${SPACE.md}px`, fontFamily: "Oswald, sans-serif", fontSize: 14, color: "#1a1a1a", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{isOverview ? `${activeUnit.unit} — All Assignments` : "Assignments & Classwork"}</span>
            {isOverview && <span style={{ fontSize: 11, fontFamily: "Lato, sans-serif", fontWeight: 400, opacity: 0.7, letterSpacing: 0 }}>in curriculum order</span>}
          </div>
          <div style={{ padding: SPACE.sm }}>
            {isOverview ? (
              activeUnit.lessons.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20, textAlign: "center", fontStyle: "italic" }}>Content coming soon...</div>
              ) : (
                activeUnit.lessons.map((lesson, li) => (
                  <div key={li}>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "#E87722", letterSpacing: 1, textTransform: "uppercase", padding: li === 0 ? `0 0 ${SPACE.xs}px` : `${SPACE.sm}px 0 ${SPACE.xs}px`, borderTop: li === 0 ? "none" : "1px solid #333" }}>
                      {lesson.title}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: SPACE.md }}>
                      {lesson.assignments.map((a, ai) => (
                        <AssignmentThumb key={ai} {...a} />
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : (
              activeLesson?.assignments.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20, textAlign: "center", fontStyle: "italic" }}>No assignments yet for this lesson.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: SPACE.md }}>
                  {activeLesson?.assignments.map((a, ai) => (
                    <AssignmentThumb key={ai} {...a} />
                  ))}
                </div>
              )
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
