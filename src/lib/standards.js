// Learning standards: the frameworks a teacher can add in the Design
// Store, the standards in each, and the matcher that suggests which of
// them a lesson's learning goals meet.
//
// Why a store item and not a setting (Jay, 2026-09-18): administrations
// like seeing standards posted with the day's goals, but it is one more
// thing on the screen and one more decision for every teacher. So the
// framework is something a teacher ADDS -- own none and there is no
// standards line anywhere on the board, no toggle, nothing to decide.
//
// Why suggest and never auto-tag: the same goal can feed two standards,
// and whether a day actually earns one depends on how far the class got,
// which no matcher can know from the goal text. The suggestions here
// are lexical -- the goals' words against each standard's statement and
// clarification note -- which is plenty for a catalogue this size, and
// the teacher confirms with one tap. Swapping in a model call later is a
// change to suggestStandards() alone.
//
// Catalogue text is the Missouri Department of Elementary and Secondary
// Education's 2016 Grade-Level Expectations, physical science strand,
// grades 9-12, copied verbatim from
// https://dese.mo.gov/media/pdf/curr-mls-standards-sci-6-12-sboe-2016
// (extracted 2026-09-18). `note` is the standard's own Clarification
// Statement, minus the label. Life, earth and space science are not in
// yet: this is the test slice, chemistry and physics.

const MISSOURI_9_12_PHYSICAL_SCIENCE = [
  { code: "9-12.PS1.A.1", text: "Use the organization of the periodic table to predict the relative properties of elements based on the patterns of electrons in the outermost energy level of atoms.",
    note: "Examples of properties that could be predicted from patterns could include reactivity of metals, types of bonds formed, numbers of bonds formed, and reactions with oxygen." },
  { code: "9-12.PS1.A.2", text: "Construct and revise an explanation for the products of a simple chemical reaction based on the outermost electron states of atoms, trends in the periodic table, and knowledge of the patterns of chemical properties.",
    note: "Examples of chemical reactions could include the reaction of sodium and chlorine, or of oxygen and hydrogen." },
  { code: "9-12.PS1.A.3", text: "Plan and conduct an investigation to gather evidence to compare physical and chemical properties of substances such as melting point, boiling point, vapor pressure, surface tension, and chemical reactivity to infer the relative strength of attractive forces between particles.",
    note: "Emphasis is on understanding the relative strengths of forces between particles. Examples of particles could include ions, atoms, molecules, and networked materials (such as graphite)." },
  { code: "9-12.PS1.A.4", text: "Apply the concepts of bonding and crystalline/molecular structure to explain the macroscopic properties of various categories of structural materials, i.e. metals, ionic (ceramics), and polymers.",
    note: "Emphasis is on the attractive and repulsive forces that determine the functioning of the material. Examples could include why electrically conductive materials are often made of metal, flexible but durable materials are made up of long chained molecules, and pharmaceuticals are designed to interact with specific receptors." },
  { code: "9-12.PS1.A.5", text: "Develop a model to illustrate that the release or absorption of energy from a chemical reaction system depends upon the changes in total bond energy.",
    note: "Emphasis is on the idea that a chemical reaction is a system that affects the energy change. Examples of models could include molecular-level drawings and diagrams of reactions, graphs showing the relative energies of reactants and products, and representations showing energy is conserved." },
  { code: "9-12.PS1.B.1", text: "Apply scientific principles and evidence to provide an explanation about the effects of changing the temperature or concentration of the reacting particles on the rate at which a reaction occurs.",
    note: "Emphasis is on student reasoning that focuses on the number and energy of collisions between molecules." },
  { code: "9-12.PS1.B.2", text: "Refine the design of a chemical system by specifying a change in conditions that would alter the amount of products at equilibrium.",
    note: "Emphasis is on the application of Le Chatelier's Principle and on refining designs of chemical reaction systems, including descriptions of the connection between changes made at the macroscopic level and what happens at the molecular level. Examples of designs could include different ways to increase product formation including adding reactants or removing products." },
  { code: "9-12.PS1.B.3", text: "Use symbolic representations and mathematical calculations to support the claim that atoms, and therefore mass, are conserved during a chemical reaction.",
    note: "Emphasis is on conservation of matter and mass through balanced chemical equations, use of the mole concept and proportional relationships." },
  { code: "9-12.PS1.C.1", text: "Use symbolic representations to illustrate the changes in the composition of the nucleus of the atom and the energy released during the processes of fission, fusion, and radioactive decay.",
    note: "Emphasis is on simple qualitative models, such as pictures or diagrams, and on the scale of energy released in nuclear processes relative to other kinds of transformations." },
  { code: "9-12.PS2.A.1", text: "Analyze data to support and verify the concepts expressed by Newton's 2nd law of motion, as it describes the mathematical relationship among the net force on a macroscopic object, its mass, and its acceleration.",
    note: "Examples of data could include tables or graphs of position or velocity as a function of time for objects subject to a net unbalanced force, such as a falling object, an object rolling down a ramp, or a moving object being pulled by a constant force." },
  { code: "9-12.PS2.A.2", text: "Use mathematical representations to support and verify the concepts that the total momentum of a system of objects is conserved when there is no net force on the system.",
    note: "Emphasis is on the quantitative conservation of momentum in interactions and the qualitative meaning of this principle." },
  { code: "9-12.PS2.A.3", text: "Apply scientific principles of motion and momentum to design, evaluate, and refine a device that minimizes the force on a macroscopic object during a collision.",
    note: "Examples of evaluation and refinement could include determining the success of the device at protecting an object from damage and modifying the design to improve it. Examples of a device could include a football helmet or a parachute." },
  { code: "9-12.PS2.B.1", text: "Use mathematical representations of Newton's Law of Gravitation to describe and predict the gravitational forces between objects.",
    note: "Emphasis is on both quantitative and conceptual descriptions of gravitational fields." },
  { code: "9-12.PS2.B.2", text: "Plan and conduct an investigation to provide evidence that an electric current can produce a magnetic field and that a changing magnetic field can produce an electric current.",
    note: "" },
  { code: "9-12.PS3.A.1", text: "Create a computational model to calculate the change in the energy of one component in a system when the changes in energy are known.",
    note: "Emphasis is on explaining the meaning of mathematical expressions used in the model." },
  { code: "9-12.PS3.A.2", text: "Develop and use models to illustrate that energy at the macroscopic scale can be accounted for as a combination of energy associated with the motions of particles (objects) and energy associated with the relative position of particles (objects).",
    note: "Examples of phenomena at the macroscopic scale could include the conversion of kinetic energy to thermal energy, the energy stored due to position of an object above the earth, and the energy stored between two electrically-charged plates. Examples of models could include diagrams, drawings, descriptions, and computer simulations." },
  { code: "9-12.PS3.A.3", text: "Design, build, and refine a device that works within given constraints to convert one form of energy into another form of energy.",
    note: "Emphasis is on both qualitative and quantitative evaluations of devices. Examples of devices could include Rube Goldberg devices, wind turbines, solar cells, solar ovens, and generators. Examples of constraints could include use of renewable energy forms and efficiency." },
  { code: "9-12.PS3.B.1", text: "Plan and conduct an investigation to provide evidence that the transfer of thermal energy when two components of different temperature are combined within a closed system results in a more uniform energy distribution among the components in the system (second law of thermodynamics).",
    note: "Emphasis is on analyzing data from student investigations and using mathematical thinking to describe the energy changes both quantitatively and conceptually. Examples of investigations could include mixing liquids at different initial temperatures or adding objects at different temperatures to water." },
  { code: "9-12.PS3.C.1", text: "Develop and use a model of two objects interacting through electric or magnetic fields to illustrate the forces between objects and the changes in energy of the objects due to the interaction.",
    note: "Examples of models could include drawings, diagrams, and texts, such as drawings of what happens when two charges of opposite polarity are near each other." },
  { code: "9-12.PS4.A.1", text: "Use mathematical representations to support a claim regarding relationships among the frequency, wavelength, and speed of waves traveling in various media.",
    note: "Examples of data could include electromagnetic radiation traveling in a vacuum and glass, sound waves traveling through air and water, and seismic waves traveling through the Earth." },
  { code: "9-12.PS4.A.2", text: "Evaluate the claims, evidence, and reasoning behind the idea that electromagnetic radiation can be described either by a wave model or a particle model, and that for some situations one model is more useful than the other.",
    note: "Emphasis is on how the experimental evidence supports the claim and how a theory is generally modified in light of new evidence. Examples of a phenomenon could include resonance, interference, diffraction, and photoelectric effect." },
  { code: "9-12.PS4.B.1", text: "Communicate technical information about how electromagnetic radiation interacts with matter.",
    note: "Examples could include solar cells capturing light and converting it to electricity; medical imaging; and communications technology." },
  { code: "9-12.PS4.B.2", text: "Evaluate the validity and reliability of claims in published materials of the effects that different frequencies of electromagnetic radiation have when absorbed by matter.",
    note: "Emphasis is on the idea that photons associated with different frequencies of light have different energies, and the damage to living tissue from electromagnetic radiation depends on the energy of the radiation. Examples of published materials could include trade books, magazines, web resources, videos, and other passages that may reflect bias." },
];

export const STANDARDS_FRAMEWORKS = [
  {
    id: "mo-sci-9-12-ps",
    label: "Missouri Learning Standards · Science 9-12 (Physical)",
    // What a chip on the board is prefixed with, so a code reads as
    // belonging to something: "MLS 9-12.PS1.A.1".
    short: "MLS",
    blurb: "Missouri's high school physical science expectations: matter and reactions (PS1), forces and motion (PS2), energy (PS3), waves (PS4). Chemistry and physics.",
    source: "https://dese.mo.gov/media/pdf/curr-mls-standards-sci-6-12-sboe-2016",
    standards: MISSOURI_9_12_PHYSICAL_SCIENCE,
  },
];

export const frameworkById = (id) => STANDARDS_FRAMEWORKS.find(f => f.id === id) || null;

// A lesson stores standards as "<frameworkId>:<code>" keys, so two
// frameworks that happen to share a code can never collide.
export const standardKey = (frameworkId, code) => `${frameworkId}:${code}`;

export function lookupStandard(key) {
  if (typeof key !== "string") return null;
  const i = key.indexOf(":");
  if (i < 0) return null;
  const framework = frameworkById(key.slice(0, i));
  const code = key.slice(i + 1);
  const std = framework?.standards.find(s => s.code === code);
  return std ? { key, framework, ...std } : null;
}

// The lesson's `standards` field (api/boardContent.js): a JSON array of
// keys, or "" for none. Anything unparseable reads as none rather than
// breaking the board.
export function parseLessonStandards(raw) {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(k => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function serializeLessonStandards(keys) {
  const unique = [...new Set(keys.filter(k => typeof k === "string"))];
  return unique.length ? JSON.stringify(unique) : "";
}

// ── Matching ────────────────────────────────────────────────────────────
// Words that carry nothing about WHICH standard a goal meets: articles,
// the "I can" / "students will" scaffolding every goal starts with, and
// the framing words the clarification notes all share.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "as", "is", "are", "be",
  "that", "this", "these", "those", "from", "at", "it", "its", "i", "can", "will", "we", "you", "our",
  "student", "students", "able", "about", "their", "which", "how", "what", "why", "when", "between",
  "into", "such", "could", "include", "examples", "example", "emphasis", "based", "given", "various",
  "one", "two", "some", "than", "other", "each", "using", "use", "used",
]);

// Just enough stemming that "reactions" meets "reaction" and "bonding"
// meets "bonds". Not a real stemmer; a real one is not needed for a
// catalogue of a few dozen entries.
function stem(w) {
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  for (const suffix of ["ations", "ation", "ing", "ed", "es", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .map(stem);
}

// Unigrams plus adjacent bigrams ("periodic table", "chemical reaction"),
// counted. A bigram match is worth more than its two words apart.
function grams(tokens) {
  const g = new Map();
  tokens.forEach((t, i) => {
    g.set(t, (g.get(t) || 0) + 1);
    if (i < tokens.length - 1) {
      const bg = `${t} ${tokens[i + 1]}`;
      g.set(bg, (g.get(bg) || 0) + 1);
    }
  });
  return g;
}

// Per framework: each standard's gram weights (statement counts fully,
// the note at half) and an inverse-document-frequency table, so a word
// that appears in every standard ("model", "evidence") counts for little
// and one that appears in one or two counts for a lot. Built once.
const indexCache = new Map();
function indexFor(framework) {
  if (indexCache.has(framework.id)) return indexCache.get(framework.id);
  const docs = framework.standards.map(s => {
    const weights = new Map();
    for (const [g, n] of grams(tokenize(s.text))) weights.set(g, (weights.get(g) || 0) + n);
    for (const [g, n] of grams(tokenize(s.note))) weights.set(g, (weights.get(g) || 0) + n * 0.5);
    return { standard: s, weights };
  });
  const df = new Map();
  for (const d of docs) for (const g of d.weights.keys()) df.set(g, (df.get(g) || 0) + 1);
  const N = docs.length;
  const idf = (g) => Math.log((N + 1) / ((df.get(g) || 0) + 1)) + 1;
  const index = { docs, idf };
  indexCache.set(framework.id, index);
  return index;
}

/**
 * The standards a set of learning goals most plausibly meets, best first.
 *
 * `texts` is every goal on the lesson (one string each); they are scored
 * together, since a lesson's standards are one list. Returns at most
 * `limit` entries, each { key, framework, code, text, note, score }, and
 * nothing at all when no standard shares a meaningful word with the
 * goals -- an empty list is the honest answer, not the least-bad guess.
 * Keys in `exclude` (already chosen) are left out.
 */
export function suggestStandards(texts, frameworks, { limit = 3, exclude = [] } = {}) {
  const tokens = tokenize((texts || []).join("\n"));
  if (tokens.length === 0 || !frameworks?.length) return [];
  const goalGrams = grams(tokens);
  const skip = new Set(exclude);
  const scored = [];
  for (const framework of frameworks) {
    const { docs, idf } = indexFor(framework);
    for (const { standard, weights } of docs) {
      const key = standardKey(framework.id, standard.code);
      if (skip.has(key)) continue;
      let score = 0;
      for (const [g, n] of goalGrams) {
        const w = weights.get(g);
        if (!w) continue;
        // A goal that repeats a word is not more about it; cap the goal
        // side at one. Bigrams are the strongest signal there is here.
        score += Math.min(n, 1) * Math.min(w, 2) * idf(g) * (g.includes(" ") ? 2 : 1);
      }
      if (score > 0) scored.push({ key, framework, ...standard, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  // Only suggestions in the same league as the best one. A distant third
  // that shares one common word is noise, not a suggestion.
  const floor = scored[0].score * 0.45;
  return scored.filter(s => s.score >= floor).slice(0, limit);
}

/** Every standard in the given frameworks whose code or text contains `query`, for the browse list. */
export function searchStandards(frameworks, query, limit = 12) {
  const q = String(query || "").trim().toLowerCase();
  const out = [];
  for (const framework of frameworks || []) {
    for (const s of framework.standards) {
      if (!q || s.code.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)) {
        out.push({ key: standardKey(framework.id, s.code), framework, ...s });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
