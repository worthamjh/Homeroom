// The classroom timer that hangs on the bulletin strip, in two looks that
// share one countdown: the round face with the red wedge that shrinks as
// the minutes run out, which every classroom has on the wall, and a
// digital one with big LCD digits. Jay (2026-09-29): "a bell ringer should
// take, let's say 5 minutes ... there is a timer on the bulletin that
// counts down ... the teacher is greeting students and taking attendance
// ... once the timer goes to 0, the teacher collects the bellringers and
// gets the class period started." And: "I would like for the timer to look
// like it could actually be a physical timer that a classroom might have."
//
// Setting the time is the + and - buttons, a minute at a time, the way a
// kitchen timer's M+ works -- nothing to open, nothing to type. The number
// it lands on is remembered per classroom (TIMER_MINUTES_KEY), and that is
// the count a Bell Ringer starts when it goes up on the board (see the
// effect in WebsterGrovesChemistry.jsx). Tapping the face or the play
// button starts and pauses; tapping the digits resets. At zero the digits
// blink red and a short chime plays, so a teacher at the door with the
// attendance list hears it.
//
// Which timer is up, and whether one is up at all, is a Bulletin Board
// setting in Build, like the notebooks; owning one in the Design Store is
// what makes it available (DESIGN_AREAS.TIMER in boardConfig.js).
import { useCallback, useEffect, useRef, useState } from "react";

// A full turn of the dial is an hour, as on the real thing.
const DIAL_MS = 60 * 60 * 1000;

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
// faces and the board use; `start()` with no argument runs the set time.
export function useCountdown(minutes) {
  const totalMs = Math.max(1, minutes) * 60000;
  const [state, setState] = useState({ status: "idle", endsAt: null, remainingMs: totalMs });

  // Idle follows the set time, so + and - show on the face at once.
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

// ── Faces ──────────────────────────────────────────────────────────────
const two = (n) => String(n).padStart(2, "0");
const readout = (ms, twoDigitMinutes) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${twoDigitMinutes ? two(m) : m}:${two(s)}`;
};

// The dial: white face, minute ticks, and the red disc that covers as
// much of the hour as is left, from twelve o'clock anticlockwise, the way
// the real one is set by turning the disc.
function DialFace({ remainingMs, size }) {
  const frac = Math.max(0, Math.min(1, remainingMs / DIAL_MS));
  const r = 38;
  const angle = frac * 2 * Math.PI;
  const ex = 50 - r * Math.sin(angle);
  const ey = 50 - r * Math.cos(angle);
  const wedge = frac >= 0.9999
    ? `M50,${50 - r} A${r},${r} 0 1,0 50,${50 + r} A${r},${r} 0 1,0 50,${50 - r} Z`
    : frac <= 0 ? "" : `M50,50 L50,${50 - r} A${r},${r} 0 ${angle > Math.PI ? 1 : 0},0 ${ex.toFixed(2)},${ey.toFixed(2)} Z`;
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * 2 * Math.PI;
    const major = i % 5 === 0;
    const r1 = major ? 40 : 42.5;
    const r2 = 45;
    ticks.push(<line key={i} x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)} x2={50 + r2 * Math.sin(a)} y2={50 - r2 * Math.cos(a)} stroke={major ? "#2b2b2b" : "#9a9a9a"} strokeWidth={major ? 1.6 : 0.8} />);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <circle cx="50" cy="50" r="49" fill="#3a3a3a" />
      <circle cx="50" cy="50" r="46.5" fill="#fbfbf8" stroke="#c9c9c9" strokeWidth="1" />
      {ticks}
      {wedge && <path d={wedge} fill="#e3312d" />}
      <circle cx="50" cy="50" r="3.2" fill="#2b2b2b" />
      <circle cx="50" cy="50" r="1.2" fill="#8a8a8a" />
    </svg>
  );
}

// The plastic buttons under either face.
function Button({ label, title, onClick, wide }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: wide ? 30 : 20, height: 18, padding: 0, borderRadius: 9, cursor: "pointer",
        border: "1px solid #a9a9a9", background: "linear-gradient(180deg, #f6f6f6, #d9d9d9)",
        boxShadow: "0 1px 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.9)",
        color: "#2b2b2b", fontFamily: "Lato, sans-serif", fontSize: 11, fontWeight: 700, lineHeight: 1,
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
// when + or - is pressed while nothing is counting.
export default function BulletinTimer({ style = "dial", minutes = 5, maxMinutes = 60, onMinutesChange, countdown, interactive = true }) {
  const { status, remainingMs, totalMs } = countdown;
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
  const controls = interactive ? (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <Button label="−" title="One minute less" onClick={() => adjust(-1)} />
      <Button wide label={running ? "❚❚" : done ? "↺" : "▶"} title={running ? "Pause" : done ? "Reset" : status === "paused" ? "Resume" : "Start"} onClick={toggle} />
      <Button label="+" title="One minute more" onClick={() => adjust(1)} />
    </div>
  ) : null;

  // The digits. Tapping them resets; while done they blink red.
  const digits = (text, big) => (
    <div
      role={interactive ? "button" : undefined}
      title={interactive ? "Reset" : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); countdown.reset(); } : undefined}
      style={{
        background: "linear-gradient(180deg, #c3cfb4, #d3ddc6)", border: "1px solid #7f8a73", borderRadius: 3,
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.45)", padding: big ? "2px 8px" : "1px 6px",
        fontFamily: "'Courier New', Courier, monospace", fontWeight: 700, fontSize: big ? 26 : 13, letterSpacing: big ? 2 : 1, lineHeight: 1.1,
        color: done ? "#c1121f" : "#1f2a1a", animation: done ? "gbTimerBlink 1s steps(1) infinite" : "none",
        cursor: interactive ? "pointer" : "default", userSelect: "none", minWidth: big ? 88 : 46, textAlign: "center",
      }}
    >
      {text}
    </div>
  );

  const housing = {
    position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 7px",
    borderRadius: 10, background: "linear-gradient(180deg, #f4f4f2, #dcdcd8)", border: "1px solid #b9b9b4",
    boxShadow: "0 2px 4px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.8)", boxSizing: "border-box",
    fontFamily: "Lato, sans-serif",
  };
  // The same pushpin the notebooks hang from, so the two read as pinned to
  // the one board.
  const pin = <span aria-hidden style={{ position: "absolute", left: "50%", top: -4, marginLeft: -5, width: 10, height: 10, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ff7b7b, #c8201f 70%)", boxShadow: "0 1px 2px rgba(0,0,0,0.6)" }} />;

  if (style === "digital") {
    return (
      <div style={{ ...housing, flexDirection: "column", gap: 5, height: 74, width: 128, justifyContent: "center" }} onClick={interactive ? toggle : undefined} title={interactive ? (running ? "Tap to pause" : "Tap to start") : undefined}>
        <style>{BLINK}</style>
        {pin}
        {digits(readout(remainingMs, true), true)}
        {controls}
      </div>
    );
  }
  return (
    <div style={{ ...housing, height: 74, width: 134 }} onClick={interactive ? toggle : undefined} title={interactive ? (running ? "Tap to pause" : "Tap to start") : undefined}>
      <style>{BLINK}</style>
      {pin}
      <DialFace remainingMs={counting || done ? remainingMs : totalMs} size={56} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
        {digits(readout(remainingMs, false), false)}
        {controls}
      </div>
    </div>
  );
}

// The store's card: the timer as it hangs, set to five minutes, nothing
// to press.
export function TimerPreview({ style }) {
  const five = 5 * 60000;
  return <BulletinTimer style={style} minutes={5} countdown={{ status: "idle", remainingMs: five, totalMs: five }} interactive={false} />;
}
