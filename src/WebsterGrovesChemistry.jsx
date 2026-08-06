import { useState, useEffect, useRef } from "react";

const THUMB = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w400`;

// Cinderblock wall texture — real running-bond coursing (offset joints every other row),
// built as a small tiled SVG so it scales cleanly at any resolution.
const CINDERBLOCK_TILE = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
  <line x1='0' y1='0' x2='0' y2='80' stroke='#c2b89e' stroke-width='2'/>
  <line x1='160' y1='0' x2='160' y2='80' stroke='#c2b89e' stroke-width='2'/>
  <line x1='0' y1='80' x2='160' y2='80' stroke='#c2b89e' stroke-width='2'/>
  <line x1='80' y1='80' x2='80' y2='160' stroke='#c2b89e' stroke-width='2'/>
  <line x1='0' y1='160' x2='160' y2='160' stroke='#c2b89e' stroke-width='2'/>
</svg>`;
const CINDERBLOCK_BG = `url("data:image/svg+xml,${encodeURIComponent(CINDERBLOCK_TILE)}")`;

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
    <div style={{ background: "#1a1a1a", borderTop: "4px solid #E87722", padding: "16px 20px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, flexShrink: 0 }}>
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
      "Lab Safety",
      "Accuracy vs. Precision",
      "Physical vs. Chemical Change",
      "Scientific Notation",
      "Lab — Chemistry in a Bag",
      "Lab 1A — Observations & Properties",
      "Lab 1B — Bunsen Burner",
      "Lab 1C — Candle Experiment",
      "Lab 1D — Quantitative Observations",
    ],
    lessons: [
      {
        title: "Lab Safety",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vRUYsT5bi-Ks4gk9i7Ef-fW3QxkbaRLxLFRpVbf7toOUXtqWJamVY9NPWlQIi7U2V9RCC9sEUhrz2Sz/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify key lab safety rules.",
          "I will be able to locate safety equipment in the lab.",
          "I will be able to respond appropriately to a lab emergency.",
        ],
        assignments: [
          { label: "Science Student Safety Contract", url: "https://kami.app/WWY-kkP-eA6-WHM", thumb: "/assignments/safety-contract.png" },
          { label: "POGIL — Check Yourself Before You Wreck Yourself", url: "https://kami.app/55C-MEv-uVD-gzG", thumb: "/assignments/pogil-check-yourself.png" },
        ],
      },
      {
        title: "Accuracy vs. Precision",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vToJlUt5KScZu5OkbI62CkRXy0DmT-zj5TF6T7J7B44XEgJQVWHb7l-XsUkt6_cWBaUnJI_UlMuWVP6/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to distinguish between accuracy and precision.",
          "I will be able to identify accurate and precise data sets.",
          "I will be able to calculate percent error.",
        ],
        assignments: [
          { label: "POGIL — Accuracy and Precision", url: "https://kami.app/XJ2-Q6N-sW3-EHa", thumb: "/assignments/pogil-accuracy-precision.png" },
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
          { label: "Notes — Physical and Chemical Changes", url: "https://kami.app/SmD-k2Y-ttE-TTT", thumb: "/assignments/notes-physical-chemical.png" },
        ],
      },
      {
        title: "Scientific Notation",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vSLNTgxmHxGwaF0HF4TQm7SUAeC7O5UIwzDHvld82GF0PQeVtZhgv9XDC6XwLHeLsZouOmpDbm2pjqF/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to convert numbers from decimal to scientific notation.",
          "I will be able to convert numbers from scientific notation to decimal notation.",
          "I will be able to explain the relative value of a number based on its exponent.",
        ],
        assignments: [
          { label: "POGIL — Numbers for Nerds", url: "https://kami.app/utL-fgR-m8S-9g1", thumb: "/assignments/pogil-numbers-for-nerds.png" },
        ],
      },
      {
        title: "Lab 1A — Observations & Properties",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vSgr58tVRgRe--Y5GqxbUDqi4afiWDIxfQwUssHdr5p5gS67dTXyTAMujMTMK0FhYqqT5ZqwV5Rsokn/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to make qualitative observations.",
          "I will be able to identify physical properties of matter.",
          "I will be able to generate scientific questions from observations.",
        ],
        assignments: [
          { label: "Lab 1A — Observations and Properties", url: "https://kami.app/wDm-NEd-XX8-pnD", thumb: "/assignments/lab-1a-observations.png" },
        ],
      },
      {
        title: "Lab 1B — Bunsen Burner",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vS2OamHyFdZOA80NpfZ_SkzUAckE1uLN7IxZRUr3Z2xiPPHqpn3VmLV6Rr72qYcWcUkOfG4CQf4i7b1/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to safely light and adjust a Bunsen burner.",
          "I will be able to identify the parts of a Bunsen burner.",
          "I will be able to describe the difference between a blue and yellow flame.",
        ],
        assignments: [
          { label: "Lab 1B — Bunsen Burner Lab", url: "https://kami.app/bBB-xTH-Jur-ibZ", thumb: "/assignments/lab-1b-bunsen-burner.png" },
        ],
      },
      {
        title: "Lab 1C — Candle Experiment",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vS2OamHyFdZOA80NpfZ_SkzUAckE1uLN7IxZRUr3Z2xiPPHqpn3VmLV6Rr72qYcWcUkOfG4CQf4i7b1/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to identify the products of combustion.",
          "I will be able to describe the function of a candle wick.",
          "I will be able to support conclusions with experimental evidence.",
        ],
        assignments: [
          { label: "Lab 1C — Candle Experiment", url: "https://kami.app/BTu-Kxz-trE-k9d", thumb: "/assignments/lab-1c-candle-experiment.png" },
        ],
      },
      {
        title: "Lab 1D — Quantitative Observations",
        slides: "https://docs.google.com/presentation/d/e/2PACX-1vQFIXix7JHDOl79POMoKu3lKugChTwHjh1xPlilu9shY5xtCl10OkvOxj6a2Ah3epSenrI70nW9qkZG/embed?start=false&loop=false&delayms=3000",
        goals: [
          "I will be able to differentiate between qualitative and quantitative observations.",
          "I will be able to calculate density from experimental data.",
          "I will be able to calculate percent error.",
        ],
        assignments: [
          { label: "Lab 1D — Quantitative Observations in Chemistry", url: "https://kami.app/cEA-dwB-KcJ-tm4", thumb: "/assignments/lab-1d-quantitative-observations.png" },
        ],
      },
    ],
  },
  { unit: "Unit 2", title: "Unit 2", overview: [], lessons: [] },
  { unit: "Unit 3", title: "Unit 3", overview: [], lessons: [] },
  { unit: "Unit 4", title: "Unit 4", overview: [], lessons: [] },
  { unit: "Unit 5", title: "Unit 5", overview: [], lessons: [] },
  { unit: "Unit 6", title: "Unit 6", overview: [], lessons: [] },
  { unit: "Unit 7", title: "Unit 7", overview: [], lessons: [] },
  { unit: "Unit 8", title: "Unit 8", overview: [], lessons: [] },
  { unit: "Unit 9", title: "Unit 9", overview: [], lessons: [] },
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
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", background: "#111", borderRadius: "8px 8px 0 0", padding: "8px 8px 0", border: "2px solid #2a2a2a", borderBottom: "none" }}>
        <div style={{ background: "#0a0a0a", borderRadius: "4px 4px 0 0", aspectRatio: "16/9", overflow: "hidden", border: "1px solid #1a1a1a" }}>
          <iframe src={src} style={{ width: "100%", height: "100%", border: "none", display: "block" }} allowFullScreen title="slides" />
        </div>
      </div>
      <div style={{ width: "100%", height: 18, background: "#111", border: "2px solid #2a2a2a", borderTop: "1px solid #333", borderRadius: "0 0 6px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
        <span style={{ fontSize: 8, color: "#444", fontFamily: "Oswald, sans-serif", letterSpacing: 2 }}>SMART</span>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#1a6c1a", boxShadow: "0 0 4px #1a6c1a" }} />
      </div>
      <div style={{ width: "70%", height: 10, background: "#0e0e0e", borderRadius: "0 0 4px 4px", border: "1px solid #222", borderTop: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "0 12px" }}>
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

export default function App() {
  const [activeUnitIdx, setActiveUnitIdx] = useState(null);
  const [activeLesson, setActiveLesson] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [checkedGoals, setCheckedGoals] = useState({});

  const isHome = activeUnitIdx === null;
  const activeUnit = isHome ? null : curriculum[activeUnitIdx];
  const isOverview = activeLesson === null;

  const toggleGoal = (lessonTitle, idx) => {
    const key = `${lessonTitle}-${idx}`;
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

  return (
    <div onClick={() => setOpenDropdown(null)}
      style={isHome
        ? { background: "#1a1a1a", height: "100vh", fontFamily: "Lato, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }
        : { background: "#ded6c0", backgroundImage: CINDERBLOCK_BG, backgroundSize: "160px 80px", minHeight: "100vh", fontFamily: "Lato, sans-serif" }
      }>

      {/* ── Top bar ── */}
      <div style={{ background: "#1a1a1a", borderBottom: "4px solid #E87722", flexShrink: 0 }}>
        <div style={{ padding: "14px 20px 10px", textAlign: "center" }}>
          <div
            onClick={() => { setActiveUnitIdx(null); setActiveLesson(null); setOpenDropdown(null); }}
            style={{ fontFamily: "Oswald, sans-serif", color: "#fff", fontSize: 26, fontWeight: 600, letterSpacing: 2, cursor: "pointer", display: "inline-block" }}
          >
            Webster Groves <span style={{ color: "#E87722" }}>Chemistry</span>
          </div>
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
                style={{ background: activeUnitIdx === ui && isOverview ? "#fff" : "#E87722", color: activeUnitIdx === ui && isOverview ? "#E87722" : "#1a1a1a", border: "none", borderRight: "1px solid rgba(0,0,0,0.2)", padding: "10px 4px", fontSize: 13, fontFamily: "Oswald, sans-serif", cursor: "pointer", letterSpacing: 0.5, width: "100%", fontWeight: 600, transition: "all 0.15s" }}
                onMouseEnter={e => { if (!(activeUnitIdx === ui && isOverview)) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#1a1a1a"; }}}
                onMouseLeave={e => { if (!(activeUnitIdx === ui && isOverview)) { e.currentTarget.style.background = "#E87722"; e.currentTarget.style.color = "#1a1a1a"; }}}
              >
                {u.unit}
              </button>

              {/* Dropdown */}
              {openDropdown === ui && u.lessons.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, minWidth: 210, background: "#1a1a1a", border: "1px solid #E87722", borderTop: "none", borderRadius: "0 0 4px 4px", zIndex: 100, overflow: "hidden" }}>
                  {u.lessons.map((lesson, li) => (
                    <div key={li}
                      onClick={() => handleLessonClick(ui, lesson)}
                      style={{ padding: "9px 14px", fontSize: 13, fontFamily: "Lato, sans-serif", fontWeight: 700, color: activeLesson?.title === lesson.title ? "#E87722" : "#ccc", cursor: "pointer", borderBottom: "1px solid #2a2a2a", transition: "all 0.12s", whiteSpace: "nowrap", borderLeft: activeLesson?.title === lesson.title ? "3px solid #E87722" : "3px solid transparent", paddingLeft: activeLesson?.title === lesson.title ? 11 : 14 }}
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

      {isHome ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a" }}>
          <div style={{ height: "100%", aspectRatio: "2.1", overflow: "hidden" }}>
            <img
              src="/images/wghs-building.jpg"
              alt="Webster Groves High School"
              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
            />
          </div>
        </div>
      ) : (
      <>
      {/* ── Room ── */}
      <div style={{ padding: 20, maxWidth: 1700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Board unit */}
        <div style={{ display: "flex", flexDirection: "column", border: "7px solid #8B6914", borderRadius: 5, overflow: "hidden", boxShadow: "0 4px 18px rgba(0,0,0,0.35)" }}>

          {/* Bulletin strip */}
          <div style={{ background: "#1a2a4a", position: "relative", minHeight: 68, flexShrink: 0 }}>
            <Stars height={68} />
          </div>

          {/* Chalkboard */}
          <div style={{ background: "#2d5a2d", borderTop: "4px solid #6B4F10", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", minHeight: 360 }}>

              {/* Slides side */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 10px 10px 14px", gap: 10 }}>
                <div style={{ width: "100%", fontFamily: "Oswald, sans-serif", fontSize: 16, color: "rgba(255,255,255,0.8)", letterSpacing: 2, textShadow: "1px 1px 2px rgba(0,0,0,0.6)" }}>
                  {boardTitle}
                </div>
                <div style={{ width: "100%", maxWidth: 480 }}>
                  <SmartBoard src={boardSlides} />
                </div>
              </div>

              {/* Goals / Overview side */}
              <div style={{ borderLeft: "1px dashed rgba(255,255,255,0.18)", padding: "14px 14px 10px 16px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 6, marginBottom: 4 }}>
                  {isOverview ? "Unit Lessons" : "Learning Goals"}
                </div>

                {isOverview ? (
                  activeUnit.overview.map((item, i) => (
                    <div key={i}
                      onClick={() => { const lesson = activeUnit.lessons.find(l => l.title === item); if (lesson) setActiveLesson(lesson); }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: activeUnit.lessons.find(l => l.title === item) ? "pointer" : "default", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span style={{ fontFamily: "Oswald, sans-serif", fontSize: 11, color: "#E87722", minWidth: 18, opacity: 0.8 }}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: "rgba(255,255,255,0.82)", lineHeight: 1.3, textShadow: "1px 1px 2px rgba(0,0,0,0.5)" }}>{item}</span>
                    </div>
                  ))
                ) : (
                  activeLesson?.goals.map((goal, i) => {
                    const key = `${activeLesson.title}-${i}`;
                    const checked = checkedGoals[key];
                    return (
                      <div key={i} onClick={() => toggleGoal(activeLesson.title, i)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                        <div style={{ width: 15, height: 15, border: `2px solid ${checked ? "#E87722" : "rgba(255,255,255,0.4)"}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, background: checked ? "#E87722" : "transparent", transition: "all 0.15s" }}>
                          {checked && <span style={{ color: "white", fontSize: 9, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ fontFamily: "Caveat, cursive", fontSize: 15, color: checked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)", lineHeight: 1.35, textShadow: "1px 1px 2px rgba(0,0,0,0.5)", textDecoration: checked ? "line-through" : "none" }}>
                          {goal}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chalk ledge */}
            <div style={{ height: 8, background: "#5c3d0e", borderTop: "2px solid #3a2408", display: "flex", alignItems: "center", padding: "0 10px", gap: 8 }}>
              {[["#f0f0f0", 18], ["#E87722", 18], ["#f0f0f0", 12]].map(([c, w], i) => (
                <div key={i} style={{ width: w, height: 4, borderRadius: 1, background: c }} />
              ))}
            </div>
          </div>
        </div>

        {/* Assignments section */}
        <div style={{ background: "#1a1a1a", border: "3px solid #E87722", borderRadius: 4, overflow: "hidden", boxShadow: "0 3px 12px rgba(0,0,0,0.25)" }}>
          <div style={{ background: "#E87722", padding: "8px 14px", fontFamily: "Oswald, sans-serif", fontSize: 14, color: "#1a1a1a", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{isOverview ? `${activeUnit.unit} — All Assignments` : "Assignments & Classwork"}</span>
            {isOverview && <span style={{ fontSize: 11, fontFamily: "Lato, sans-serif", fontWeight: 400, opacity: 0.7, letterSpacing: 0 }}>in curriculum order</span>}
          </div>
          <div style={{ padding: 12 }}>
            {isOverview ? (
              activeUnit.lessons.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20, textAlign: "center", fontStyle: "italic" }}>Content coming soon...</div>
              ) : (
                activeUnit.lessons.map((lesson, li) => (
                  <div key={li}>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, color: "#E87722", letterSpacing: 1, textTransform: "uppercase", padding: li === 0 ? "0 0 8px" : "12px 0 8px", borderTop: li === 0 ? "none" : "1px solid #333" }}>
                      {lesson.title}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {activeLesson?.assignments.map((a, ai) => (
                    <AssignmentThumb key={ai} {...a} />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
      </>
      )}

      <ToolsFooter />
    </div>
  );
}
