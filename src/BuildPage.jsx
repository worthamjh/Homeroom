import { useState, useRef, useEffect, useCallback } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { getActiveTeacherId, DEFAULT_TEACHER_ID, CLERK_CONFIGURED, boardThemeVars } from "./boardConfig";
import { fetchProfile } from "./lib/profileApi";
import BoardSettingsPanel from "./BoardSettingsPanel";

/**
 * BuildPage — "Build", opened in its own browser tab from the 🛠 icon on
 * the board (see TopBar in WebsterGrovesChemistry.jsx). This USED to be one
 * of two separate pages — this content-editing page, plus a second
 * Settings page (gear icon) for board formatting (background, layout,
 * bulletin, board content, blackboard). Jay's feedback: teachers just want
 * one place to "build" the board, not two tabs to remember and flip
 * between depending on whether they're changing content or formatting. So
 * this page now embeds BOTH: the real board, live and editable, on the
 * left; the same categorized formatting panel Settings used to own
 * (BoardSettingsPanel, see that file) on the right. Settings itself is now
 * just a redirect to here (see SettingsPage.jsx) so old bookmarks/muscle
 * memory still land somewhere sensible.
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
 * iframe on "/board?build=1" — bigger here than Settings' preview, since this
 * is the whole page rather than half of it, but the same scaled-to-fit
 * technique. The one real difference from Settings' preview: this iframe
 * is fully interactive. Every empty content spot (calendar, a lesson's
 * slideshow, a lesson's assignments) shows its own dashed "+" tile right
 * where that content will actually appear; an already-filled spot reveals
 * "Change"/"Remove" controls on hover. All of that logic lives directly
 * in WebsterGrovesChemistry.jsx, gated behind the isBuildMode flag (true
 * only for this embedded copy) — see AddCalendarCard, AddSlidesCard,
 * AddAssignmentCard, and BuildEditableSlot there. This page is just the
 * frame around it, now with the formatting panel added alongside.
 *
 * A real board tab (no ?build=1) never shows any of these affordances, so
 * it stays safe to project in front of a class — that's the whole reason
 * Build exists as a separate tab instead of buttons on the live board.
 */

// Intrinsic WIDTH the embedded board renders its document at — same idea
// as Settings' old PREVIEW_W, just scaled to fill far more of the page
// here (this sits beside a settings panel now, but still far wider than
// Settings' old half-width preview). Height is NOT a fixed constant here —
// it comes from the embedded page itself (see contentHeight below),
// because the whole point is reaching content that lives below one
// screen's worth of board (the assignments grid, where "+ Add Assignment"
// and remove controls live). BOARD_H is only the fallback shown for the
// instant before that first real measurement arrives.
const BOARD_W = 1600;
const BOARD_H = 900;

function LiveBuildBoard({ teacherId, highlightRegion, onPanelCountInfo, onViewChange, iframeRef }) {
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

  // Same highlight-region wiring as Settings' old LiveBoardPreview: send
  // whichever BoardSettingsPanel category is expanded into the iframe so
  // the real board glows the matching region right there in Build, plus
  // listen for the iframe's "ready" ping (load order isn't guaranteed) and
  // its panel-count / current-view reports.
  const sendHighlight = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "homeroom-settings-highlight", region: highlightRegion },
      window.location.origin
    );
  }, [highlightRegion, iframeRef]);

  useEffect(() => { sendHighlight(); }, [sendHighlight]);

  useEffect(() => {
    const handler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "homeroom-settings-preview-ready") sendHighlight();
      if (e.data?.type === "homeroom-preview-panel-count") {
        onPanelCountInfo?.({ requestedCount: e.data.requestedCount, resolvedCount: e.data.resolvedCount });
      }
      if (e.data?.type === "homeroom-build-current-view") {
        onViewChange?.({ unitIdx: e.data.unitIdx, lessonTitle: e.data.lessonTitle });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sendHighlight, onPanelCountInfo, onViewChange, iframeRef]);

  // teacherId is already carried by localStorage (see getActiveTeacherId
  // in boardConfig.js — the same sticky value the real board tab set),
  // but passing it explicitly here too means opening this iframe's URL
  // directly always lands on the right identity even in a fresh tab that
  // hasn't inherited localStorage yet (shouldn't happen same-origin, but
  // costs nothing to be explicit).
  const src = `/board?build=1&teacher=${encodeURIComponent(teacherId)}`;

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: contentHeight * scale,
        overflow: "hidden", borderRadius: 10,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        background: "var(--board-primary)",
      }}
    >
      <iframe
        ref={iframeRef}
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

// Shown in place of the live board when Clerk is configured and nobody's
// signed in. Build is the one page that's gated — it's where teacher-owned
// content actually gets created/changed, unlike the board itself (public
// pitch-demo, viewable by anyone) or Settings (only touches local display
// prefs). See the CLERK_CONFIGURED note below for why the gate itself is
// conditional on Clerk being set up at all, not just on being signed in.
function SignInPrompt() {
  return (
    <div style={{ background: "var(--board-primary)", border: "1px dashed rgba(255,255,255,0.25)", borderRadius: 10, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, color: "#fff", marginBottom: 8 }}>
        Sign in to build your board
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 20, maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
        Signing in gives you your own Homeroom — your calendar, slides, and assignments, saved under your account instead of a shared browser.
      </div>
      <SignInButton mode="modal">
        <button style={{ background: "var(--board-secondary)", color: "var(--board-primary)", border: "none", borderRadius: 6, padding: "10px 22px", fontFamily: "Oswald, sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: 0.5, cursor: "pointer" }}>
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}

export default function BuildPage() {
  const activeTeacherId = getActiveTeacherId();
  const isBlankTeacher = activeTeacherId !== DEFAULT_TEACHER_ID;

  // Same theming as the real board (see WebsterGrovesChemistry.jsx) — Build
  // renders outside the iframe, so it needs its own profile fetch rather
  // than inheriting the embedded board's CSS vars.
  const [teacherProfile, setTeacherProfile] = useState(null);
  useEffect(() => {
    if (!isBlankTeacher) return;
    let cancelled = false;
    fetchProfile(activeTeacherId)
      .then(p => { if (!cancelled) setTeacherProfile(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isBlankTeacher, activeTeacherId]);
  const themeVars = isBlankTeacher
    ? boardThemeVars(teacherProfile?.primaryColor, teacherProfile?.secondaryColor)
    : boardThemeVars();

  const iframeRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [panelCountInfo, setPanelCountInfo] = useState(null);
  // Build's own current unit/lesson, reported up by the embedded board
  // (see the "homeroom-build-current-view" postMessage in
  // WebsterGrovesChemistry.jsx). Used only to build the "← Back to board"
  // link below — Build never writes this to the shared currentView
  // localStorage key itself (that stays real-tab-only, see the comment on
  // writeCurrentView's effect), it just remembers it long enough to hand
  // it back to a fresh real tab as ?unit=&lesson= deep-link params.
  const [currentView, setCurrentView] = useState(null);

  const backHref = (() => {
    const params = new URLSearchParams();
    if (isBlankTeacher) params.set("teacher", activeTeacherId);
    if (currentView && currentView.unitIdx != null) {
      params.set("unit", String(currentView.unitIdx));
      if (currentView.lessonTitle) params.set("lesson", currentView.lessonTitle);
    }
    const qs = params.toString();
    return qs ? `/board?${qs}` : "/board";
  })();

  // The board + its own "not built yet" footnote, as one unit — reused
  // identically whether Clerk is configured (rendered only <SignedIn>) or
  // not (rendered unconditionally, same as every page behaved before this
  // pass). Kept as a variable rather than inlined twice so the two
  // branches below can't drift apart from each other.
  const board = (
    <div style={{ flex: "1 1 900px", minWidth: 320 }}>
      <LiveBuildBoard
        teacherId={activeTeacherId}
        iframeRef={iframeRef}
        highlightRegion={selected}
        onPanelCountInfo={setPanelCountInfo}
        onViewChange={setCurrentView}
      />
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontStyle: "italic", marginTop: 16, textAlign: "center" }}>
        Adding whole new units and lessons isn't built yet — this manages content within the units/lessons that already exist. Browsing your Google Drive to pick slides (instead of pasting a link) is the next big step for this page.
      </div>
    </div>
  );
  const settingsPanel = (
    <div style={{ flex: "0 1 380px", minWidth: 300 }}>
      <BoardSettingsPanel selected={selected} onSelect={setSelected} panelCountInfo={panelCountInfo} />
    </div>
  );

  return (
    <div style={{ ...themeVars, minHeight: "100vh", background: "#141414", fontFamily: "Lato, sans-serif" }}>
      <div style={{ background: "var(--board-primary)", borderBottom: "3px solid var(--board-secondary)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: "#fff", letterSpacing: 1 }}>
            🛠 Build {isBlankTeacher && <span style={{ color: "var(--board-secondary)" }}>— teacher: "{activeTeacherId}"</span>}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, maxWidth: 640 }}>
            This is your actual board — click a "+" to add a calendar, slides, or an assignment right where it will show up, or use the panel on the right to change how the board looks. Changes save immediately and show up next time the real board tab loads. This page itself is never meant to be projected in class.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {/* CLERK_CONFIGURED false only happens on a checkout missing
              VITE_CLERK_PUBLISHABLE_KEY (see .env.example) — rendering any
              Clerk component then would throw, since there's no
              <ClerkProvider> mounted (see main.jsx). Skipping this whole
              block in that case means Build still works, un-gated, exactly
              like before this pass, instead of a blank white screen. */}
          {CLERK_CONFIGURED && (
            <>
              <SignedIn>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button style={{ background: "transparent", color: "var(--board-secondary)", border: "1px solid var(--board-secondary)", borderRadius: 6, padding: "6px 14px", fontFamily: "Oswald, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer" }}>
                    Sign in
                  </button>
                </SignInButton>
              </SignedOut>
            </>
          )}
          <a href={backHref} style={{ color: "var(--board-secondary)", fontFamily: "Oswald, sans-serif", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, textDecoration: "none", flexShrink: 0 }}>
            ← Back to board
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1720, margin: "0 auto", padding: "24px 24px 40px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {CLERK_CONFIGURED ? (
          <>
            <SignedIn>
              {board}
              {settingsPanel}
            </SignedIn>
            <SignedOut>
              <div style={{ flex: "1 1 100%" }}>
                <SignInPrompt />
              </div>
            </SignedOut>
          </>
        ) : (
          <>
            {board}
            {settingsPanel}
          </>
        )}
      </div>
    </div>
  );
}
