import { useState, useEffect, useCallback, useRef } from "react";
import { useScopedSetting, BUILD_TOUR_DONE_KEY, DEFAULT_BUILD_TOUR_DONE } from "./boardConfig";

/**
 * GuidedTour — a first-run, step-by-step walkthrough for a brand new
 * blank-shell teacher on the Build page, spotlighting one real control at
 * a time (the actual Unit 1 tab, the actual Add Lesson button, the actual
 * Learning Goals field, the actual sidebar categories) rather than a
 * separate mockup or a wall of text. Jay's ask, from a screenshot of a
 * fresh Clerk sign-up landing on an empty, unexplained board: "more of a
 * tutorial style type of setup where it tells you to create a unit and so
 * on."
 *
 * Lives entirely in BuildPage.jsx's own document (not inside the iframe),
 * because it needs to see BOTH halves of Build at once: the live board
 * (rendered inside an iframe — see LiveBuildBoard in BuildPage.jsx) and
 * the formatting sidebar (BoardSettingsPanel, rendered directly in this
 * same parent document). That iframe is same-origin and never sandboxed
 * (see BuildPage.jsx's own comment on why), so this component reaches
 * into it directly via `iframeRef.current.contentDocument` to find and
 * measure the elements it spotlights — no new postMessage channel needed
 * on top of the ones WebsterGrovesChemistry.jsx already has.
 *
 * Every real control this tour points at carries a `data-tour="..."`
 * attribute (see TopBar / AddEmbedCard / the flat learningGoals branch in
 * WebsterGrovesChemistry.jsx, and the category header in
 * BoardSettingsPanel.jsx) — this file is the only place that needs to
 * know what those strings mean.
 *
 * Steps gate on the SAME real state a teacher's own actions produce (a
 * unit actually getting created, a lesson actually getting added, a
 * sidebar category actually getting opened) rather than a separate "did
 * they click my overlay" tracker — polled on an interval while the tour
 * is running (cheap: a couple of querySelectors) plus recomputed
 * immediately whenever `selected` changes, since that one *is* already
 * lifted state in the parent. This is deliberately real gating, not just
 * "click Next whenever" — the whole point of a spotlight tour, per Jay's
 * choice, is that a teacher can't wander past a step without actually
 * doing it. There's no pre-made starter content to click through
 * (BLANK_CURRICULUM in WebsterGrovesChemistry.jsx is empty) — the tour
 * itself walks a brand-new teacher through creating their real first
 * unit and lesson via the actual "+ Add Unit"/"+ Add Lesson" controls,
 * pre-filled with a generic name ("Unit 1", "Lesson 1") they can accept
 * or rename on the spot. Steps that point at genuinely optional/creative
 * work (typing real learning goals, pasting a real slides link) are the
 * one exception — gating those on real content would strand a teacher
 * who doesn't have that content handy yet, so those advance on an
 * explicit "Got it" click instead (see `gate: "ack"` below).
 */

// Intrinsic width the embedded board document renders at — same constant
// as BuildPage's own BOARD_W, passed in as a prop rather than imported
// so this file has no dependency on BuildPage's internals beyond the
// iframe ref itself.
const DEFAULT_BOARD_WIDTH = 1600;

const STEPS = [
  {
    id: "welcome",
    frame: "none",
    gate: "ack",
    title: "Let's set up your board",
    body: "We'll make your first unit, your first lesson, and a bit of content. A couple of minutes, and you can skip any time.",
    ackLabel: "Let's go",
  },
  {
    // Real gate, not "ack" — a brand-new blank-shell teacher starts with
    // zero units (see BLANK_CURRICULUM in WebsterGrovesChemistry.jsx), so
    // this is genuinely the teacher's first required action rather than
    // something already done for them. The "+ Add Unit" control isn't
    // inside any hover-only dropdown (it always renders in TopBar), so
    // unlike the two steps below it needs no self-heal for a closing
    // dropdown.
    id: "add-unit",
    frame: "board",
    selector: '[data-tour="tour-add-unit"]',
    gate: "auto",
    title: "Create your first unit",
    body: "Click “+ Add Unit”. A name is filled in already — keep it or type your own, then Enter.",
  },
  {
    id: "open-unit",
    frame: "board",
    selector: '[data-tour="tour-unit-tab"]',
    gate: "auto",
    title: "There's your unit",
    // "Click it to open it" said what to do and not why, and leaned on
    // "it" twice. Naming the unit would be worse -- a teacher may have
    // renamed it, and then the copy is simply wrong.
    body: "Open it to start adding lessons.",
  },
  {
    // Also a real gate now, not "ack" — the unit was just created empty,
    // so unlike the old pre-seeded starter curriculum, adding a lesson
    // here is a genuinely required action, not a redundant second lesson.
    // The dropdown this button lives in is hover-only (see TopBar) and
    // closes the instant the teacher's cursor leaves it to click into the
    // tooltip or type into the input — the self-heal below re-opens it on
    // every poll tick while this step needs it.
    id: "row-controls",
    frame: "board",
    selector: '[data-tour="tour-unit-actions"]',
    gate: "ack",
    title: "Rename, hide, delete",
    body: "The three buttons on the right: ✎ renames, the eye hides it from the board without deleting, × removes it. Lessons and assignments have the same three.",
    ackLabel: "Got it",
  },
  {
    // The rename / hide / delete group is the only way to rename anything,
    // and it is small, unlabelled and easy to scroll past. Explained on the
    // unit tab above because that is the FIRST place it appears, and the
    // same three buttons then turn up on lessons and assignments -- so one
    // explanation covers all of them (Jay: "would like users to know about
    // the rename, hide, show, and delete buttons. At least on one of the
    // instances where they show up"). It reuses the unit tab's existing
    // target rather than adding a hook of its own: the buttons live inside
    // that row, so spotlighting the row shows them where they act.
    id: "add-lesson",
    frame: "board",
    selector: '[data-tour="tour-add-lesson"]',
    gate: "auto",
    title: "Add your first lesson",
    body: "A lesson is one class period — slides, goals, assignments. Click “+ Add Lesson”, then keep the name or type your own and press Enter.",
  },
  {
    id: "open-lesson",
    frame: "board",
    selector: '[data-tour="tour-lesson-item"]',
    gate: "auto",
    title: "Open your first lesson",
    body: "Click it to open it and start adding content.",
  },
  // No Learning Goals step any more. It had nothing to click -- a "Got
  // it" over a field the teacher could already see -- and its anchor only
  // exists on a flat board, so with Sliding Boards on it decided no lesson
  // was open. Jay: "nothing to click and kind of out of place, we can
  // eliminate this step and save it for the Board Content part of the
  // tour." The goals are named there now, alongside the other content.
  {
    id: "add-slides",
    missingHint: "Open a lesson from the unit above — this one lives on a lesson's board.",
    frame: "board",
    // The same attribute follows the slot through every state it can be
    // in -- the "Add Slides" button, the open form, and the filled
    // smartboard after a save (see renderLessonSlides in
    // WebsterGrovesChemistry.jsx). It used to sit on the button alone,
    // which unmounts the instant a teacher clicks it, so the tour lost
    // its target on the very click it asked for and fell back to "open a
    // lesson" while they were looking at the open form.
    selector: '[data-tour="tour-add-slides"]',
    gate: "ack",
    // Beside the target, never below it: below the form lands on the
    // smartboard, which is the thing being described. Jay: "the add your
    // slides sign needs to be moved off of the smartboard."
    placement: "beside",
    title: "Add your slides",
    // Named both routes, and both ecosystems. The old line described only
    // pasting, when the card's first and easier option is browsing Drive
    // -- and said "Google Slides" to a teacher who may well be on
    // PowerPoint (Jay, signed in with Microsoft: "technically they don't
    // have to paste a link, that is one option but they can just connect
    // google drive").
    body: "Click “Add Slides”, then browse your Drive, upload a PowerPoint from your computer, or paste a link. It fills the board, ready to project.",
    ackLabel: "Got it",
  },
  {
    // Assignments live BELOW the fold, which is the strongest case there
    // is for a tour step: something important a new teacher will not
    // stumble on. Jay, walking a fresh signup: "there is no add
    // assignments tutorial section."
    id: "add-assignment",
    frame: "board",
    selector: '[data-tour="tour-add-assignment"]',
    gate: "ack",
    // The unit overview has an assignments section too -- every lesson's,
    // listed -- so a teacher there looks for the Add tile in it and finds
    // none (Jay: "I think the add assignment button went away"). Say
    // where it is, not just that this is the wrong page.
    missingHint: "This page lists the whole unit's assignments; adding one happens on a lesson. Click a lesson under “Unit Lessons” on the board and the Add Assignment tile appears below it.",
    title: "Assignments and classwork",
    // Same correction: the card takes a direct upload as well as a Drive
    // pick, and upload is the route a teacher without Google uses.
    // Above its tile when there is room. Below, the natural first choice,
    // fell off the bottom of a scrolled page and landed under the tile --
    // while the copy still said "below the board" about an assignment
    // sitting above the tooltip (Jay: "the sign goes below the assignment,
    // and still refers to the assignment being below"). The ring already
    // says where the tile is, so the copy no longer tries to.
    placement: "above",
    body: "Pick a worksheet from your Drive or upload one from your computer — it stays with this lesson.",
    ackLabel: "Got it",
  },
  {
    id: "sidebar-intro",
    frame: "sidebar",
    selector: '[data-tour="tour-sidebar"]',
    gate: "ack",
    title: "Change how your board looks",
    body: "This side changes how the board looks — the wall, the layout, what’s on it. Separate from what’s in your lessons.",
    ackLabel: "Next",
  },
  {
    id: "board-content",
    frame: "sidebar",
    // Under the category rather than beside it. Beside put the tooltip
    // over the content column -- the very part of the board this step
    // lights up (Jay: "the board content tour sign itself is blocking some
    // of the view of that section of the board"). Below sits in the
    // sidebar's own column and covers nothing on the board. It moves once,
    // when the category opens; if a short screen leaves no room below,
    // the sidebar's beside rule takes over.
    placement: "below",
    selector: '[data-tour="tour-cat-content"]',
    gate: "select",
    matchSelected: "content",
    title: "Board Content",
    // Says what the checkboxes DO, not which four things they are -- the
    // list is right there on screen, and naming three of the four (as the
    // copy once did) read as if the fourth were not a choice. Jay: "just
    // say something along the lines of you can turn on or off by
    // selecting the checkbox, rather than naming specifically."
    body: "Open “Board Content”. Each checkbox puts that section on the board or takes it off, and dragging ≡ changes the order. Press Got it when you’re done.",
    ackLabel: "Got it",
  },
  {
    id: "blackboard",
    frame: "sidebar",
    selector: '[data-tour="tour-cat-blackboard"]',
    gate: "select",
    matchSelected: "blackboard",
    title: "Blackboard",
    body: "Open “Blackboard”. Pick your board surface and the colour of its headings.",
    ackLabel: "Got it",
  },
  {
    // The count used to be one clause of the Blackboard step, and a
    // teacher who set it to 3 saw... a "1/3" in the corner and nothing
    // else. Jay: "the number of boards selected doesn't really show that
    // there are multiple boards outside of the number at the bottom. I
    // think guiding the user to try the sliding mechanism would be
    // useful." So: this step rings the control, the next one rings the
    // arrows and waits for a real slide.
    // "Got it" used to move on regardless, so a teacher who left it at 1
    // arrived at "Slide the board" with no arrows to slide and a hint to
    // go back (Jay: "you have to go back and click 2, some people might
    // get stuck there"). Now the step waits for 2 or more -- picking it
    // IS the advance -- and "Skip step" is the way past for a teacher who
    // wants a flat board; the slide step then skips itself (below).
    id: "board-count",
    frame: "sidebar",
    selector: '[data-tour="tour-board-count"]',
    missingHint: "Open “Blackboard” in the side panel, with a lesson showing on the board — Number of Boards lives at the bottom of it.",
    gate: "auto",
    title: "Number of boards",
    body: "1 is a single flat board. 2 to 5 stack up like a real sliding chalkboard, each with its own goals and content. Pick 2 or more to try it, or skip this step to keep a single board.",
  },
  {
    id: "slide-board",
    frame: "board",
    // Both arrows on the front board, ringed together (see union below).
    selector: '[data-tour="tour-slide-handle"][data-tour-front="true"]',
    union: true,
    placement: "above",
    missingHint: "Set Number of Boards to 2 or more and the arrows appear at the bottom corners of the board.",
    gate: "auto",
    title: "Slide the board",
    body: "Click an arrow at the bottom corner to slide this board aside and reveal the next one. Click it again to bring it back.",
  },
  {
    id: "done",
    frame: "none",
    gate: "ack",
    title: "You're all set!",
    // Names the two things the tour deliberately does NOT walk through --
    // the calendar and the Store. Both are optional, and spending a new
    // teacher's patience on them before they have any real content would
    // invert the priority; but leaving them entirely unmentioned meant
    // they might never be found. One sentence at the end, when the
    // teacher is done rather than being led.
    body: "The 🛠 icon on your board brings you back here. Two things we skipped: a unit can hold a class calendar, and the Store has more board styles. Have a great class!",
    ackLabel: "Finish",
  },
];

function boardDocument(iframeEl) {
  if (!iframeEl) return null;
  try {
    return iframeEl.contentDocument || null;
  } catch {
    return null;
  }
}

// An element inside the (scaled) board iframe, measured in this parent
// document's coordinates.
function rectFromBoardElement(iframeEl, el, boardWidth) {
  if (!iframeEl || !el) return null;
  const iframeRect = iframeEl.getBoundingClientRect();
  if (iframeRect.width === 0) return null;
  const scale = iframeRect.width / boardWidth;
  const childRect = el.getBoundingClientRect();
  return {
    left: iframeRect.left + childRect.left * scale,
    top: iframeRect.top + childRect.top * scale,
    width: childRect.width * scale,
    height: childRect.height * scale,
  };
}

function rectFromBoardTarget(iframeEl, selector, boardWidth, union = false) {
  const doc = boardDocument(iframeEl);
  if (!doc) return null;
  if (!union) return rectFromBoardElement(iframeEl, doc.querySelector(selector), boardWidth);
  // One ring around everything that matches -- the two slide arrows sit
  // at opposite corners of a board, and a ring on just the first would
  // point at one and hide the other under the scrim.
  let box = null;
  for (const el of doc.querySelectorAll(selector)) {
    const r = rectFromBoardElement(iframeEl, el, boardWidth);
    if (!r) continue;
    box = box
      ? {
          left: Math.min(box.left, r.left),
          top: Math.min(box.top, r.top),
          right: Math.max(box.right, r.left + r.width),
          bottom: Math.max(box.bottom, r.top + r.height),
        }
      : { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height };
  }
  return box ? { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top } : null;
}

// Google's Drive picker, when it is open. The picker SDK draws its dialog
// into the board's own document (the card that opens it lives there), so
// from out here it is just another element under the scrim -- and the
// scrim dimmed it while the ring stayed on the tile that opened it. Jay:
// "the highlighted region is still on the assignment section and not on
// the google drive picker." While one is showing, it is what the teacher
// is looking at, so it is what the ring goes around. ".picker-dialog" is
// the SDK's own class for the dialog frame; it has been stable for years,
// and if it ever changes the worst case is the old behaviour back.
function rectFromOpenPicker(iframeEl, boardWidth) {
  const doc = boardDocument(iframeEl);
  if (!doc) return null;
  for (const el of doc.querySelectorAll(".picker-dialog")) {
    if (el.style.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return rectFromBoardElement(iframeEl, el, boardWidth);
  }
  return null;
}

function rectFromSidebarTarget(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function boardTargetExists(iframeEl, selector) {
  if (!iframeEl) return false;
  let doc;
  try {
    doc = iframeEl.contentDocument;
  } catch {
    return false;
  }
  return !!doc && !!doc.querySelector(selector);
}

export default function GuidedTour({ active, onDone, iframeRef, selected, boardWidth = DEFAULT_BOARD_WIDTH }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState(null);
  // Which step has already been scrolled into view -- once per step, the
  // first time its target is actually found. Without this a step whose
  // target sat above or below the fold was invisible from where the
  // teacher happened to be: the scrim went (sidebar steps have none), the
  // ring was off screen, the tooltip was clamped to a corner they were
  // not looking at, and the tour appeared to have quit. Jay, pressing
  // Skip step at the bottom of a long page: "it takes you out of the
  // tour without going out of the tour."
  const revealedStep = useRef(-1);
  const [, setTourDone] = useScopedSetting(BUILD_TOUR_DONE_KEY, DEFAULT_BUILD_TOUR_DONE, k => k === "true" || k === "false");
  const step = STEPS[stepIdx];

  // Reset to the first step every time the tour is (re)started, so
  // re-opening it from the "Take the tour again" link (see BuildPage.jsx)
  // always begins at the welcome card rather than wherever it last left
  // off.
  useEffect(() => {
    if (active) setStepIdx(0);
  }, [active]);

  const finish = useCallback(() => {
    setTourDone("true");
    onDone?.();
  }, [setTourDone, onDone]);

  const advance = useCallback(() => {
    setStepIdx(i => {
      if (i >= STEPS.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  // Auto-expand the sidebar category this step is about to spotlight is
  // deliberately NOT done here — the teacher clicking "Board Content" /
  // "Blackboard" themselves is the actual lesson for those two steps
  // (gate: "select" below just watches for that click having happened).

  // The "Add Lesson" button and each lesson's dropdown row only exist in
  // the board's own DOM while Unit 1's dropdown is open (hover-revealed —
  // see TopBar in WebsterGrovesChemistry.jsx), which the mouse leaves the
  // instant a teacher moves it to click this tour's own "Got it"/"Next"
  // button, closing the dropdown before the next step ever gets a chance
  // to spotlight anything inside it. Self-heals that by re-clicking the
  // Unit 1 tab (which both opens its overview AND its dropdown — see the
  // same TopBar change) whenever this step's own target has gone missing.
  //
  // Deliberately re-heals on EVERY poll tick rather than once per step
  // activation: a teacher's cursor can leave the dropdown's hover zone
  // more than once while they're on this step (glancing at the tooltip,
  // moving toward "Got it", moving back) and a one-shot heal only fixes
  // the first closure — every closure after that left the spotlight
  // pointing at nothing with no target to click, which is exactly the
  // "click it" tooltip with nothing highlighted that a teacher would see.
  // Re-clicking the already-open tab is a no-op in the board's own state,
  // so polling this every 300ms doesn't fight the teacher for control —
  // it only ever fires when the dropdown has actually gone missing.
  useEffect(() => {
    if (!active || !step) return;
    const compute = () => {
      let r = null;
      if (step.frame === "board") {
        r = rectFromOpenPicker(iframeRef.current, boardWidth)
          || rectFromBoardTarget(iframeRef.current, step.selector, boardWidth, step.union);
        if (!r && (step.id === "add-lesson" || step.id === "open-lesson")) {
          let doc;
          try { doc = iframeRef.current?.contentDocument; } catch { doc = null; }
          doc?.querySelector('[data-tour="tour-unit-tab"]')?.click();
          r = rectFromBoardTarget(iframeRef.current, step.selector, boardWidth);
        }
      } else if (step.frame === "sidebar") {
        r = rectFromSidebarTarget(step.selector);
      }
      setRect(r);
      // Bring the target on screen, once, the first time this step finds
      // it. Rects are viewport-relative, so "off screen" is simply a top
      // above 0 or a bottom past the window; scroll so it sits a little
      // below the top edge, where the tooltip has room beside or under it.
      if (r && revealedStep.current !== stepIdx) {
        revealedStep.current = stepIdx;
        const vh = window.innerHeight;
        const offScreen = r.top < 0 || r.top + r.height > vh;
        if (offScreen) window.scrollBy({ top: r.top - 80, behavior: "smooth" });
      }
    };
    compute();
    const interval = setInterval(compute, 300);
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [active, step, iframeRef, boardWidth, selected]);

  // Auto-advancing ("gate: auto") steps: poll the real board's own DOM
  // for the thing this step is actually asking the teacher to do (create
  // a unit, open it, add a lesson, open that lesson) and move on the
  // moment it's true — same real state a teacher's own click already
  // produces, not a separate "did they click my overlay" tracker.
  useEffect(() => {
    if (!active || !step || step.gate !== "auto") return;
    const check = () => {
      let done = false;
      if (step.id === "add-unit") {
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-unit-tab"]');
      } else if (step.id === "open-unit") {
        // Deliberately NOT "does tour-add-lesson exist" -- the unit tab's
        // dropdown (which is what actually renders that button) opens on
        // mouse *hover*, not just click (see TopBar), so a cursor merely
        // passing over the tab on its way to this tooltip's own button was
        // enough to satisfy that check without a real click ever happening.
        // data-tour-clicked is only set once handleUnitOverview has
        // actually run, which only a real click triggers.
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-unit-tab"][data-tour-clicked="true"]');
      } else if (step.id === "add-lesson") {
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-lesson-item"]');
      } else if (step.id === "open-lesson") {
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-learning-goals"]')
          || boardTargetExists(iframeRef.current, '[data-tour="tour-add-slides"]');
      } else if (step.id === "board-count") {
        // Satisfied the moment the board is a sliding one: the arrows
        // exist only with 2 or more boards.
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-slide-handle"]');
      } else if (step.id === "slide-board") {
        // With a single board there is nothing to slide, so this step
        // does not apply: skip it rather than ask for a setting the
        // teacher just chose not to make.
        if (!boardTargetExists(iframeRef.current, '[data-tour="tour-slide-handle"]')) { advance(); return; }
        // A parked board is one the teacher has slid aside -- the real
        // thing this step asks for, not a click on the tooltip.
        done = boardTargetExists(iframeRef.current, '[data-tour="tour-slide-handle"][data-parked="true"]');
      }
      if (done) advance();
    };
    check();
    const interval = setInterval(check, 300);
    return () => clearInterval(interval);
  }, [active, step, iframeRef, advance]);

  // "gate: select" steps used to advance the INSTANT the sidebar's
  // `selected` category matched -- so the panel opened and the tour
  // immediately moved on, before a teacher could look at what had just
  // appeared, let alone try it (Jay: "it opens up the options but the text
  // moves on to the blackboard tab, rather than give the user time to add
  // or move the order of board content").
  //
  // Now selecting the category only UNLOCKS the step: the button appears
  // and the teacher advances when they are ready. The category is still
  // genuinely required -- until it is open there is no button to press --
  // so the step still cannot be skipped past without doing the thing.
  const selectSatisfied =
    step?.gate === "select" && selected === step.matchSelected;

  // A step whose target is not on screen must not read as if it were.
  // "gate: ack" steps show their body and a Got it button unconditionally,
  // so navigating back to the unit overview left the tour cheerfully
  // saying "Paste a Google Slides link here" with nothing spotlighted and
  // no such field anywhere -- Jay: "I managed to be on a unit page, not a
  // lesson page, and it is running me through the tutorial for a lesson
  // page." Now such a step shows where to go instead, and withholds its
  // button until the teacher is somewhere it makes sense.
  const targetMissing = !!step?.selector && !rect;

  // The button that moves the tour on; absent, the step is waiting on the
  // teacher. Separately, every step but the last also offers "Skip step":
  // a teacher who does not want to do this one right now should not have
  // to abandon the whole tour to get past it (Jay: "wouldn't mind a skip
  // step or next step button as well, rather than just skip the tour...
  // at all of the different steps"). Not a Back button, which stays out
  // on purpose: see the decisions log.
  const primaryShown = (step?.gate === "ack" || selectSatisfied) && !targetMissing;
  const skipStepShown = stepIdx < STEPS.length - 1;

  if (!active || !step) return null;

  // Tooltip placement: beside the spotlighted rect, never on top of it.
  //
  // This used to try below, then flip above if below overflowed. That
  // assumed "every real target here sits in the upper-to-middle part of
  // the page", which is false for the sidebar step: the settings panel is
  // full-height on the right, so neither below nor above fits, the flip
  // clamped to the top of the screen, and the tooltip landed squarely over
  // the options it was describing (Jay, walking a fresh signup: "the
  // location of the text box moves in front of some of the options").
  //
  // So there is now a third case. When the target is too tall for either
  // side, sit BESIDE it -- to its left where there is room, which is where
  // a right-hand sidebar wants it.
  const TOOLTIP_W = 320;
  const TOOLTIP_H = 180;   // generous estimate; only used to choose a side
  const GAP = 14;
  const EDGE = 16;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  let tooltipStyle;
  if (rect) {
    // The sidebar is a special case, and forcing it here is what stops the
    // tooltip jumping. Its height changes every time a teacher expands or
    // collapses a category, so a placement re-derived from the rect flips
    // between below / above / beside on every poll and the tooltip hops
    // around the screen (Jay: "the text box also moves up and down
    // depending on what is clicked, it is kind of not ideal"). Its LEFT
    // and TOP are stable, so anchoring beside it holds still.
    // A step can also ask for this itself (placement: "beside") when
    // below/above would land the tooltip on the thing it describes.
    const besideSidebar = step.frame === "sidebar" || step.placement === "beside";
    const wantsBelow = step.placement === "below";
    const wantsAbove = step.placement === "above";
    const fitsBelow = (!besideSidebar || wantsBelow) && rect.top + rect.height + GAP + TOOLTIP_H <= viewportH - EDGE;
    const fitsAbove = !besideSidebar && rect.top - GAP - TOOLTIP_H >= EDGE;
    let left;
    let top;
    if (fitsBelow && !(wantsAbove && fitsAbove)) {
      left = rect.left;
      top = rect.top + rect.height + GAP;
    } else if (fitsAbove) {
      left = rect.left;
      top = rect.top - GAP - TOOLTIP_H;
    } else {
      const roomOnLeft = rect.left - GAP - TOOLTIP_W >= EDGE;
      const roomOnRight = rect.left + rect.width + GAP + TOOLTIP_W <= viewportW - EDGE;
      // A step that asked to be beside its target goes to the RIGHT when
      // there is room. Left-first is what the sidebar wants (it hugs the
      // right edge), but for the slides step left meant "over the
      // smartboard" -- the exact spot the step was moved off of.
      const preferRight = step.placement === "beside" && roomOnRight;
      left = preferRight ? rect.left + rect.width + GAP
        : roomOnLeft ? rect.left - GAP - TOOLTIP_W
        : rect.left + rect.width + GAP;
      // Near the target's top rather than centred on it: a full-height
      // target centred would put the tooltip mid-screen, far from the
      // controls the step is actually talking about.
      top = rect.top + 24;
    }
    left = Math.max(EDGE, Math.min(left, viewportW - TOOLTIP_W - EDGE));
    top = Math.max(EDGE, Math.min(top, viewportH - TOOLTIP_H - EDGE));
    tooltipStyle = { position: "fixed", left, top, width: TOOLTIP_W };
  } else {
    tooltipStyle = { position: "fixed", left: "50%", top: "50%", width: TOOLTIP_W, transform: "translate(-50%, -50%)" };
  }

  return (
    <>
      {rect && (
        <div
          style={{
            position: "fixed",
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 8,
            // Sidebar steps get the ring WITHOUT the dark scrim. The board
            // already dims itself to match the selected category (see
            // dimUnless in WebsterGrovesChemistry.jsx), and laying a second
            // blanket of darkness over the top stamped that out -- so the
            // teacher was told to look at the Blackboard settings while the
            // blackboard itself sat dark. Jay: "the blackboard area on the
            // left side should be normal brightness." Two dimming systems
            // fighting; the board's own is the one that knows which region
            // the category controls, so it wins.
            boxShadow: step.frame === "sidebar"
              ? "0 0 0 3px var(--board-secondary, #e87722)"
              : "0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 3px var(--board-secondary, #e87722)",
            pointerEvents: "none",
            zIndex: 9998,
            transition: "left 0.2s, top 0.2s, width 0.2s, height 0.2s",
          }}
        />
      )}
      {!rect && (
        // pointerEvents none is load-bearing. Without it this scrim ate
        // every click while a target was missing -- and a missing target is
        // exactly when the teacher most needs to click something (to get
        // to the lesson the hint is pointing at). Jay: "it says waiting for
        // you but you can't click on anything."
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998, pointerEvents: "none" }} />
      )}
      <div
        style={{
          ...tooltipStyle,
          zIndex: 9999,
          background: "#1c1c1c",
          border: "1px solid var(--board-secondary, #e87722)",
          borderRadius: 10,
          padding: 18,
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          fontFamily: "Lato, sans-serif",
        }}
      >
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 15, fontWeight: 600, color: "var(--board-secondary-accent, #e87722)", marginBottom: 8 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, marginBottom: 16 }}>
          {targetMissing
            ? (step.missingHint || "This one lives somewhere else on the board — head there and this step will pick up again.")
            : step.body}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              type="button"
              onClick={finish}
              style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "Lato, sans-serif" }}
            >
              Skip tour
            </button>
            {skipStepShown && (
              <button
                type="button"
                onClick={advance}
                style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "Lato, sans-serif", textDecoration: "underline" }}
              >
                Skip step
              </button>
            )}
          </div>
          {primaryShown ? (
            <button
              type="button"
              onClick={advance}
              style={{ background: "var(--board-secondary, #e87722)", color: "var(--board-secondary-fg, #1c1c1c)", border: "none", borderRadius: 6, padding: "8px 18px", fontFamily: "Oswald, sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 0.5, cursor: "pointer" }}
            >
              {step.ackLabel || "Next"}
            </button>
          ) : (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
              Waiting for you…
            </div>
          )}
        </div>
      </div>
    </>
  );
}
