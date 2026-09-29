// The classroom timer that hangs on the bulletin strip: a digital
// countdown in a small housing, in a few looks that differ only in the
// plastic and the display and share one engine. Jay (2026-09-29): "a bell
// ringer should take, let's say 5 minutes ... there is a timer on the
// bulletin that counts down ... the teacher is greeting students and
// taking attendance ... once the timer goes to 0, the teacher collects the
// bellringers and gets the class period started." It has to look "like it
// could actually be a physical timer that a classroom might have", and
// later the same day, having tried both: the dial "looks off", the
// digital one "works really well", so "make a couple of different digital
// options that look different but function the same".
//
// Setting the time is the + and - buttons, a minute at a time, the way a
// kitchen timer's M+ works -- nothing to open, nothing to type. The number
// it lands on is remembered per classroom (TIMER_MINUTES_KEY), and that is
// the count a Bell Ringer starts when it goes up on the board (see the
// effect in WebsterGrovesChemistry.jsx). Tapping the housing or the play
// button starts and pauses; tapping the numbers resets -- kept as a tap
// rather than a fourth button because "it keeps the interface simple",
// and said so on the store card and in Build's help. At zero the digits
// blink red and a short chime plays, so a teacher at the door with the
// attendance list hears it.
//
// Which timer is up, and whether one is up at all, is a Bulletin Board
// setting in Build, like the notebooks; owning one in the Design Store is
// what makes it available (DESIGN_AREAS.TIMER in boardConfig.js). In Build
// it also carries the notebooks' ☰ grip, and drags along the strip the
// same way (startTimerDrag on the board).
import { useCallback, useEffect, useRef, useState } from "react";

// ── The countdown ──────────────────────────────────────────────────────
// Time is kept as an END INSTANT while running, so a tab the browser
// throttles in the background (a board left up on a projector while the
// teacher's laptop sleeps its display) still shows the right number when
// it repaints; the interval only repaints, it never counts.
let audioCtx = null;
function ensureAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}
// Four soft sine notes, high-low-high-low, under a second in all. Made
// with the audio API rather than a file so nothing has to load and the
// content policy needs no new source.
function chime() {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    [[988, 0], [784, 0.2], [988, 0.4], [784, 0.6]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.2, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    });
  } catch { /* no sound is not an error */ }
}

// `minutes` is the set time. Returns the live state plus the controls the
// timer and the board use; `start()` with no argument runs the set time.
export function useCountdown(minutes) {
  const totalMs = Math.max(1, minutes) * 60000;
  const [state, setState] = useState({ status: "idle", endsAt: null, remainingMs: totalMs });

  // Idle follows the set time, so + and - show on the display at once.
  useEffect(() => {
    setState(s => (s.status === "idle" ? { ...s, remainingMs: totalMs } : s));
  }, [totalMs]);

  useEffect(() => {
    if (state.status !== "running") return;
    const tick = () => setState(s => {
      if (s.status !== "running") return s;
      const left = s.endsAt - Date.now();
      return left <= 0 ? { status: "done", endsAt: null, remainingMs: 0 } : { ...s, remainingMs: left };
    });
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.status, state.endsAt]);

  const rang = useRef(false);
  useEffect(() => {
    if (state.status === "done" && !rang.current) { rang.current = true; chime(); }
    if (state.status !== "done") rang.current = false;
  }, [state.status]);

  const start = useCallback((ms) => {
    ensureAudio();   // inside the tap that starts it, where a browser lets sound begin
    const run = ms ?? totalMs;
    setState({ status: "running", endsAt: Date.now() + run, remainingMs: run });
  }, [totalMs]);
  const pause = useCallback(() => setState(s => (s.status === "running"
    ? { status: "paused", endsAt: null, remainingMs: Math.max(0, s.endsAt - Date.now()) }
    : s)), []);
  const resume = useCallback(() => setState(s => (s.status === "paused"
    ? { status: "running", endsAt: Date.now() + s.remainingMs, remainingMs: s.remainingMs }
    : s)), []);
  const reset = useCallback(() => setState({ status: "idle", endsAt: null, remainingMs: totalMs }), [totalMs]);
  // A minute more or less on a count already under way, like a microwave's
  // +30s. Idle and done are the set time's business (the parent's setter).
  const nudge = useCallback((deltaMs) => setState(s => {
    if (s.status === "running") {
      const endsAt = Math.max(Date.now() + 1000, s.endsAt + deltaMs);
      return { ...s, endsAt, remainingMs: endsAt - Date.now() };
    }
    if (s.status === "paused") return { ...s, remainingMs: Math.max(1000, s.remainingMs + deltaMs) };
    return s;
  }), []);

  return { ...state, totalMs, start, pause, resume, reset, nudge };
}

// ── Looks ──────────────────────────────────────────────────────────────
// Each is a set of surfaces for the same housing: the plastic, the
// display, the digits, the buttons. Ids are the store's SKUs
// (TIMER_STYLES in boardConfig.js); anything unknown falls back to classic.
const LOOKS = {
  // The white kitchen-timer classic: grey-green LCD, black digits.
  classic: {
    housing: "linear-gradient(180deg, #f4f4f2, #dcdcd8)", border: "#b9b9b4", highlight: "rgba(255,255,255,0.8)",
    lcd: "linear-gradient(180deg, #c3cfb4, #d3ddc6)", lcdBorder: "#7f8a73", lcdInset: "inset 0 1px 3px rgba(0,0,0,0.45)",
    digit: "#1f2a1a", done: "#c1121f", glow: "none",
    button: { bg: "linear-gradient(180deg, #f6f6f6, #d9d9d9)", border: "#a9a9a9", color: "#2b2b2b" },
  },
  // The gym-wall scoreboard: black housing, red LED digits that glow.
  scoreboard: {
    housing: "linear-gradient(180deg, #333333, #141414)", border: "#050505", highlight: "rgba(255,255,255,0.14)",
    lcd: "#0a0a0a", lcdBorder: "#000", lcdInset: "inset 0 1px 4px rgba(0,0,0,0.9)",
    digit: "#ff3b30", done: "#ff3b30", glow: "0 0 7px rgba(255,59,48,0.75)",
    button: { bg: "linear-gradient(180deg, #4a4a4a, #262626)", border: "#101010", color: "#f2f2f2" },
  },
  // The board's own accent colour for the plastic, a white display: the
  // one that matches the room. The colour comes from the board's theme
  // variable, so it is the teacher's, in the store as on the board.
  colors: {
    housing: "var(--board-secondary, #E87722)", border: "rgba(0,0,0,0.28)", highlight: "rgba(255,255,255,0.35)",
    lcd: "linear-gradient(180deg, #f8f8f3, #e8e8e1)", lcdBorder: "rgba(0,0,0,0.4)", lcdInset: "inset 0 1px 3px rgba(0,0,0,0.35)",
    digit: "#1c1c1c", done: "#c1121f", glow: "none",
    button: { bg: "linear-gradient(180deg, #ffffff, #e4e4e4)", border: "rgba(0,0,0,0.4)", color: "#1c1c1c" },
  },
};

const two = (n) => String(n).padStart(2, "0");
const readout = (ms) => {
  const total = Math.ceil(ms / 1000);
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
};

// The plastic buttons under the display.
function Button({ look, label, title, onClick, wide }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: wide ? 30 : 20, height: 18, padding: 0, borderRadius: 9, cursor: "pointer",
        border: `1px solid ${look.button.border}`, background: look.button.bg,
        boxShadow: "0 1px 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
        color: look.button.color, fontFamily: "Lato, sans-serif", fontSize: 11, fontWeight: 700, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

const BLINK = "@keyframes gbTimerBlink { 50% { opacity: 0.2; } }";

// `countdown` is useCountdown()'s result on the board, or a plain object
// for the store's static preview (`interactive` false: no buttons, no
// taps). `minutes` is the set time; `onMinutesChange` gets the new one
// when + or - is pressed while nothing is counting. `dragHandle` (Build
// only) draws the notebooks' ☰ grip beside the housing and
// `onDragHandlePointerDown` gets its pointer-down.
export default function BulletinTimer({ style = "classic", minutes = 5, maxMinutes = 60, onMinutesChange, countdown, interactive = true, dragHandle = false, onDragHandlePointerDown }) {
  const look = LOOKS[style] || LOOKS.classic;
  const { status, remainingMs } = countdown;
  const running = status === "running";
  const done = status === "done";
  const counting = running || status === "paused";

  const toggle = () => {
    if (!interactive) return;
    if (running) countdown.pause();
    else if (status === "paused") countdown.resume();
    else if (done) countdown.reset();
    else countdown.start();
  };
  const adjust = (delta) => {
    if (!interactive) return;
    if (counting) countdown.nudge(delta * 60000);
    else {
      const next = Math.max(1, Math.min(maxMinutes, minutes + delta));
      if (next !== minutes) onMinutesChange?.(next);
      if (done) countdown.reset();
    }
  };

  const housing = (
    <div
      onClick={interactive ? toggle : undefined}
      title={interactive ? (running ? "Tap to pause" : "Tap to start") : undefined}
      style={{
        position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
        width: 128, height: 74, padding: "8px 10px 7px", boxSizing: "border-box", borderRadius: 10,
        background: look.housing, border: `1px solid ${look.border}`,
        boxShadow: `0 2px 4px rgba(0,0,0,0.45), inset 0 1px 0 ${look.highlight}`,
        fontFamily: "Lato, sans-serif", cursor: interactive ? "pointer" : "default",
      }}
    >
      <style>{BLINK}</style>
      {/* The same pushpin the notebooks hang from, so the two read as
          pinned to the one board. */}
      <span aria-hidden style={{ position: "absolute", left: "50%", top: -4, marginLeft: -5, width: 10, height: 10, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ff7b7b, #c8201f 70%)", boxShadow: "0 1px 2px rgba(0,0,0,0.6)" }} />
      {/* The display. Tapping the numbers resets; while done they blink. */}
      <div
        role={interactive ? "button" : undefined}
        title={interactive ? "Tap the numbers to reset" : undefined}
        onClick={interactive ? (e) => { e.stopPropagation(); countdown.reset(); } : undefined}
        style={{
          background: look.lcd, border: `1px solid ${look.lcdBorder}`, borderRadius: 3, boxShadow: look.lcdInset,
          padding: "2px 8px", minWidth: 88, textAlign: "center",
          fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, fontSize: 26, letterSpacing: 2, lineHeight: 1.1,
          color: done ? look.done : look.digit, textShadow: look.glow,
          animation: done ? "gbTimerBlink 1s steps(1) infinite" : "none",
          cursor: interactive ? "pointer" : "default", userSelect: "none",
        }}
      >
        {readout(remainingMs)}
      </div>
      {interactive && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Button look={look} label="−" title="One minute less" onClick={() => adjust(-1)} />
          <Button look={look} wide label={running ? "❚❚" : done ? "↺" : "▶"} title={running ? "Pause" : done ? "Reset" : status === "paused" ? "Resume" : "Start"} onClick={toggle} />
          <Button look={look} label="+" title="One minute more" onClick={() => adjust(1)} />
        </div>
      )}
    </div>
  );

  if (!dragHandle) return housing;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span
        role="button"
        aria-label="Move the timer along the bulletin board"
        title="Drag to move along the bulletin board"
        onPointerDown={onDragHandlePointerDown}
        style={{
          width: 16, height: 30, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          cursor: "grab", color: "rgba(255,255,255,0.7)", fontSize: 14, letterSpacing: 1, userSelect: "none", touchAction: "none",
          background: "rgba(0,0,0,0.35)", borderRadius: 4, textShadow: "0 1px 1px rgba(0,0,0,0.6)",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--board-secondary-accent)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
      >
        ☰
      </span>
      {housing}
    </div>
  );
}

// The store's card: the timer as it hangs, set to five minutes, nothing
// to press.
export function TimerPreview({ style }) {
  const five = 5 * 60000;
  return <BulletinTimer style={style} minutes={5} countdown={{ status: "idle", remainingMs: five, totalMs: five }} interactive={false} />;
}
