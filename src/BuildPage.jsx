import { useState, useRef, useEffect } from "react";
import { getActiveTeacherId, DEFAULT_TEACHER_ID } from "./boardConfig";

/**
 * BuildPage — "Build", opened in its own browser tab from the 🛠 icon on
 * the board (see TopBar in WebsterGrovesChemistry.jsx), same pattern as
 * the gear-icon Settings page opening "/settings".
 *
 * First version of this page (see PROJECT_NOTES.md / the open-platform
 * plan doc) was a separate list-style editor: a page of forms off to the
 * side, disconnected from what the board actually looks like. Jay's
 * feedback was direct — most teachers are not going to spend time
 * figuring out "fancy adding and managing stuff," so this needs to be
 * designed from a tired teacher's perspective, not a software engineer's.
 * The fix borrows Settings' own trick: rather than reimplementing the
 * board a second time as a form, this embeds the REAL board (the same
 * WebsterGrovesChemistry component tree Settings previews) live in an
 * iframe on "/?build=1" — bigger here than Settings' preview, since this
 * is the whole page rather than half of it, but the same scaled-to-fit
 * technique. The one real difference from Settings' preview: this iframe
 * is fully interactive. Every empty content spot (calendar, a lesson's
 * slideshow, a lesson's assignments) shows its own dashed "+" tile right
 * where that content will actually appear; an already-filled spot reveals
 * "Change"/"Remove" controls on hover. All of that logic lives directly
 * in WebsterGrovesChemistry.jsx, gated behind the isBuildMode flag (true
 * only for this embedded copy) — see AddCalendarCard, AddSlidesCard,
 * AddAssignmentCard, and BuildEditableSlot there. This page is just the
 * frame around it.
 *
 * A real board tab (no ?build=1) never shows any of these affordances, so
 * it stays safe to project in front of a class — that's the whole reason
 * Build exists as a separate tab instead of buttons on the live board.
 */

// Intrinsic WIDTH the embedded board renders its document at — same idea
// as Settings' PREVIEW_W, just scaled to fill far more of the page here
// (this is the whole page, not a half-width panel next to a settings
// list). Height is NOT a fixed constant here — it comes from the embedded
// page itself (see contentHeight below), because the whole point is
// reaching content that lives below one screen's worth of board (the
// assignments grid, where "+ Add Assignment" and remove controls live).
// BOARD_H is only the fallback shown for the instant before that first
// real measurement arrives.
const BOARD_W = 1600;
const BOARD_H = 900;

function LiveBuildBoard({ teacherId }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [contentHeight, setContentHeight] = useState(BOARD_H);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setScale(el.clientWidth / BOARD_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The embedded board (WebsterGrovesChemistry.jsx, isBuildMode) reports
  // its real document height here whenever it changes — navigating
  // lessons, opening an add/remove form, assignment thumbnails finishing
  // loading. Safe to feed straight back into the iframe's own height
  // (unlike an earlier attempt at this): the embedded page pins its
  // "one screen" board region to a fixed 900px reference instead of 100vh
  // whenever it's inside Build, so what it reports doesn't depend on
  // whatever height we last gave the iframe — no feedback loop. This is
  // what lets the page just grow to fit and the browser scroll it
  // normally, instead of content being trapped in a fixed-size box.
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type !== "homeroom-build-content-height") return;
      if (typeof e.data.height === "number" && e.data.height > 0) setContentHeight(e.data.height);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // teacherId is already carried by localStorage (see getActiveTeacherId
  // in boardConfig.js — the same sticky value the real board tab set),
  // but passing it explicitly here too means opening this iframe's URL
  // directly always lands on the right identity even in a fresh tab that
  // hasn't inherited localStorage yet (shouldn't happen same-origin, but
  // costs nothing to be explicit).
  const src = `/?build=1&teacher=${encodeURIComponent(teacherId)}`;

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: contentHeight * scale,
        overflow: "hidden", borderRadius: 10,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        background: "#1a1a1a",
      }}
    >
      <iframe
        src={src}
        title="Live board — editable"
        scrolling="no"
        style={{
          width: BOARD_W, height: contentHeight,
          border: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          display: "block",
        }}
      />
    </div>
  );
}

export default function BuildPage() {
  const activeTeacherId = getActiveTeacherId();
  const isBlankTeacher = activeTeacherId !== DEFAULT_TEACHER_ID;

  return (
    <div style={{ minHeight: "100vh", background: "#141414", fontFamily: "Lato, sans-serif" }}>
      <div style={{ background: "#1a1a1a", borderBottom: "3px solid #E87722", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: "#fff", letterSpacing: 1 }}>
            🛠 Build {isBlankTeacher && <span style={{ color: "#E87722" }}>— teacher: "{activeTeacherId}"</span>}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, maxWidth: 640 }}>
            This is your actual board — click a "+" to add a calendar, slides, or an assignment right where it will show up. Hover anything you've already added to change or remove it. Changes save immediately and show up next time the real board tab loads. This page itself is never meant to be projected in class.
          </div>
        </div>
        <a href="/" style={{ color: "#E87722", fontFamily: "Oswald, sans-serif", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, textDecoration: "none", flexShrink: 0 }}>
          ← Back to board
        </a>
      </div>

      <div style={{ maxWidth: 1500, margin: "0 auto", padding: "24px 24px 40px" }}>
        <LiveBuildBoard teacherId={activeTeacherId} />
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontStyle: "italic", marginTop: 16, textAlign: "center" }}>
          Adding whole new units and lessons isn't built yet — this manages content within the units/lessons that already exist. Browsing your Google Drive to pick slides (instead of pasting a link) is the next big step for this page.
        </div>
      </div>
    </div>
  );
}
