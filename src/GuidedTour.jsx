import { useState, useEffect, useRef, useCallback } from "react";
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
 * Steps gate on the SAME real state a teacher's own actions produce
 * (a lesson actually getting added, a sidebar category actually getting
 * opened) rather than a separate "did they click my overlay" tracker, via
 * `isStepComplete` below — polled on an interval while the tour is
 * running (cheap: a couple of querySelectors) plus recomputed immediately
 * whenever `selected` changes, since that one *is* already lifted state
 * in the parent. This is deliberately real gating, not just "click Next
 * whenever" — the whole point of a spotlight tour, per Jay's choice, is
 * that a teacher can't wander past a step without actually doing it.
 * Steps that point at genuinely optional/creative work (typing real
 * learning goals, pasting a real slides link) are the one exception —
 * gating those on real content would strand a teacher who doesn't have
 * that content handy yet, so those advance on an explicit "Got it" click
 * instead (see `gate: "ack"` below).
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
    body: "This will only take a couple of minutes — we'll walk through adding your first unit, your first lesson, and a bit of content, one step at a time. You can skip this any time.",
    ackLabel: "Let's go",
  },
  {
    id: "open-unit",
    frame: "board",
    selector: '[data-tour="tour-unit-tab"]',
    gate: "auto",
    title: "This is Unit 1",
    body: "We created a starter unit for you already. Click it to open it.",
  },
  {
    // Deliberately "ack" rather than "auto": a starter Lesson 1 already
    // exists inside Unit 1 (same idea as Unit 1 itself — see
    // BLANK_CURRICULUM in WebsterGrovesChemistry.jsx), so the "a lesson
    // exists" condition an "auto" gate would poll for is already true the
    // moment Unit 1's dropdown opens. Forcing a real click here would
    // just create a redundant, unwanted second lesson — this step is
    // purely "here's where you'll add lesson 2, 3, and beyond," not a
    // required action right now.
    id: "add-lesson",
    frame: "board",
    selector: '[data-tour="tour-add-lesson"]',
    gate: "ack",
    title: "Adding more lessons",
    body: "A lesson is one day (or one class period) of content — slides, learning goals, assignments. This is where you'll add lesson 2, 3, and beyond whenever you're ready. You've already got a first lesson below, ready to go.",
    ackLabel: "Got it",
  },
  {
    id: "open-lesson",
    frame: "board",
    selector: '[data-tour="tour-lesson-item"]',
    gate: "auto",
    title: "Open your first lesson",
    body: "Click it to open it and start adding content.",
  },
  {
    id: "learning-goals",
    frame: "board",
    selector: '[data-tour="tour-learning-goals"]',
    gate: "ack",
    title: "Learning Goals",
    body: "Type your goals for the lesson here, one per line — students can check them off as you go through class. Come back and edit this any time.",
    ackLabel: "Got it",
  },
  {
    id: "add-slides",
    frame: "board",
    selector: '[data-tour="tour-add-slides"]',
    gate: "ack",
    title: "Add your slides",
    body: "Paste a Google Slides link here (File → Share → Publish to web) and it'll show up right on the board, full-size, ready to project.",
    ackLabel: "Got it",
  },
  {
    id: "sidebar-intro",
    frame: "sidebar",
    selector: '[data-tour="tour-sidebar"]',
    gate: "ack",
    title: "Change how your board looks",
    body: "Over here you can change the wall, the board layout, and what content shows on the board — separate from what's actually in your lessons.",
    ackLabel: "Next",
  },
  {
    id: "board-content",
    frame: "sidebar",
    selector: '[data-tour="tour-cat-content"]',
    gate: "select",
    matchSelected: "content",
    title: "Board Content",
    body: "Click “Board Content” to see it — this is where you turn Essential Question, Agenda, Bell Ringer, and Home Learning on or off, and drag to reorder them.",
  },
  {
    id: "blackboard",
    frame: "sidebar",
    selector: '[data-tour="tour-cat-blackboard"]',
    gate: "select",
    matchSelected: "blackboard",
    title: "Blackboard",
    body: "Click “Blackboard” — this is where you pick your board surface and how many sliding boards you want (1 is a single flat board; 2–5 slide).",
  },
  {
    id: "done",
    frame: "none",
    gate: "ack",
    title: "You're all set!",
    body: "Come back to Build any time from the 🛠 icon on your board to add more units, lessons, and content. Have a great class!",
    ackLabel: "Finish",
  },
];

function rectFromBoardTarget(iframeEl, selector, boardWidth) {
  if (!iframeEl) return null;
  let doc;
  try {
    doc = iframeEl.contentDocument;
  } catch {
    return null;
  }
  if (!doc) return null;
  const el = doc.querySelector(selector);
  if (!el) return null;
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
  // same TopBar change) once per step activation whenever this step's own
  // target has gone missing, rather than requiring the teacher to
  // manually re-hover Unit 1 themselves just to get the tour unstuck.
  const healedForStepRef = useRef(null);
  useEffect(() => {
    healedForStepRef.current = null;
  }, [step]);

  // Recompute the spotlight rect: on an interval while the tour is
  // running (cheap — one or two querySelectors), plus immediately on
  // scroll/resize so the highlight box doesn't lag a moving page, and
  // immediately whenever the step or the sidebar's `selected` category
  // changes.
  useEffect(() => {
    if (!active || !step) return;
    const compute = () => {
      if (step.frame === "board") {
        let r = rectFromBoardTarget(iframeRef.current, step.selector, boardWidth);
        if (!r && (step.id === "add-lesson" || step.id === "open-lesson") && healedForStepRef.current !== step.id) {
          healedForStepRef.current = step.id;
          let doc;
          try { doc = iframeRef.current?.contentDocument; } catch { doc = null; }
          doc?.querySelector('[data-tour="tour-unit-tab"]')?.click();
          r = rectFromBoardTarget(iframeRef.current, step.selector, boardWidth);
        }
        setRect(r);
      } else if (step.frame === "sidebar") {
        setRect(rectFromSidebarTarget(step.selector));
      } else {
        setRect(null);
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
  // for the thing this step is actually asking the teacher to do (open
  // Unit 1, add a lesson, open that lesson) and move on the moment it's
  // true — same real state a teacher's own click already produces, not a
  // separate "did they click my overlay" tracker.
  useEffect(() => {
    if (!active || !step || step.gate !== "auto") return;
    const check = () => {
      let done = false;
      if (step.id === "open-unit") {
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
      }
      if (done) advance();
    };
    check();
    const interval = setInterval(check, 300);
    return () => clearInterval(interval);
  }, [active, step, iframeRef, advance]);

  // "gate: select" steps: complete the instant the sidebar's own
  // `selected` category (already lifted state in BuildPage.jsx) matches
  // what this step is waiting for.
  useEffect(() => {
    if (!active || !step || step.gate !== "select") return;
    if (selected === step.matchSelected) advance();
  }, [active, step, selected, advance]);

  if (!active || !step) return null;

  // Tooltip placement: right next to the spotlighted rect when there is
  // one, clamped to stay on-screen; centered when there's no target
  // (welcome/done). Deliberately simple (below-right, or above if that
  // would run off the bottom) rather than a full collision-avoidance
  // engine — every real target here sits in the upper-to-middle part of
  // the page.
  const TOOLTIP_W = 320;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  let tooltipStyle;
  if (rect) {
    let left = rect.left;
    let top = rect.top + rect.height + 14;
    if (left + TOOLTIP_W > viewportW - 16) left = Math.max(16, viewportW - TOOLTIP_W - 16);
    if (top + 160 > viewportH - 16) top = Math.max(16, rect.top - 160 - 14);
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
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 0 0 3px var(--board-secondary, #e87722)",
            pointerEvents: "none",
            zIndex: 9998,
            transition: "left 0.2s, top 0.2s, width 0.2s, height 0.2s",
          }}
        />
      )}
      {!rect && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998 }} />
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
          {step.body}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button
            type="button"
            onClick={finish}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "Lato, sans-serif" }}
          >
            Skip tour
          </button>
          {step.gate === "ack" ? (
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
