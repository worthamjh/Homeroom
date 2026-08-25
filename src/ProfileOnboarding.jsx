import { useState } from "react";
import { saveProfile } from "./lib/profileApi";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from "./boardConfig";

/**
 * ProfileOnboarding — the short form a brand-new signed-in teacher fills
 * out exactly once, shown by LandingPage.jsx in place of the usual
 * "taking you to your board..." redirect when GET /api/profile comes back
 * empty for their teacherId. Deliberately just three fields (name, school,
 * subject/room) — enough to make the blank board feel like *theirs*
 * without turning first sign-in into a long form a tired teacher bounces
 * off of. More fields can always be added to this same document later
 * (api/profile.js already upserts, so re-saving is safe) without another
 * migration.
 */
export default function ProfileOnboarding({ teacherId, onComplete }) {
  const [teacherName, setTeacherName] = useState("");
  const [school, setSchool] = useState("");
  const [subject, setSubject] = useState("");
  // Default to Webster Groves' own black/orange — a teacher who never
  // touches these still gets a coherent look (see boardThemeVars in
  // boardConfig.js) rather than saving `null`/empty colors.
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = teacherName.trim().length > 0 && !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveProfile({
        teacherId,
        teacherName: teacherName.trim(),
        school: school.trim(),
        subject: subject.trim(),
        primaryColor,
        secondaryColor,
      });
      onComplete(saved);
    } catch (err) {
      setError(err?.message || "Something went wrong saving your profile.");
      setSaving(false);
    }
  };

  const fieldStyle = {
    width: "100%",
    background: "#0f0f0f",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#fff",
    fontSize: 14,
    fontFamily: "Lato, sans-serif",
    boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block",
    fontFamily: "Oswald, sans-serif",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
    marginBottom: 6,
  };

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 12,
        padding: "32px 28px",
        maxWidth: 420,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: "#fff", marginBottom: 6 }}>
        Welcome to Homeroom
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 24, lineHeight: 1.5 }}>
        A couple quick details and your own board is ready to build up.
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="teacherName">Your name</label>
          <input
            id="teacherName"
            style={fieldStyle}
            value={teacherName}
            onChange={e => setTeacherName(e.target.value)}
            placeholder="e.g. Ms. Rivera"
            autoFocus
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="school">School (optional)</label>
          <input
            id="school"
            style={fieldStyle}
            value={school}
            onChange={e => setSchool(e.target.value)}
            placeholder="e.g. Webster Groves High School"
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle} htmlFor="subject">Subject / room (optional)</label>
          <input
            id="subject"
            style={fieldStyle}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. Chemistry, Room 214"
          />
        </div>

        {/* Board colors — primary replaces the board's black, secondary
            replaces its orange, everywhere from the title bar to Build's
            own chrome (see boardConfig.js's boardThemeVars). School/
            subject above become the board's title the same way Webster
            Groves' own name does today — this is that same idea extended
            to color, so a teacher's board actually looks like theirs
            instead of an unbranded copy of the demo. */}
        <div style={{ marginBottom: 16, display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="primaryColor">Primary color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={e => setPrimaryColor(e.target.value)}
                style={{ width: 40, height: 36, padding: 2, background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif" }}>{primaryColor}</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="secondaryColor">Secondary color</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="secondaryColor"
                type="color"
                value={secondaryColor}
                onChange={e => setSecondaryColor(e.target.value)}
                style={{ width: 40, height: 36, padding: 2, background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif" }}>{secondaryColor}</span>
            </div>
          </div>
        </div>

        {/* Live preview of the board's title bar, exactly as it'll render
            for real (see TopBar in WebsterGrovesChemistry.jsx) — same
            school/subject split, same primary/secondary usage — so the
            color choice above isn't a guess. */}
        <div style={{ marginBottom: 24, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
          <div style={{ background: primaryColor, borderBottom: `4px solid ${secondaryColor}`, padding: "14px 16px", textAlign: "center" }}>
            <span style={{ fontFamily: "Oswald, sans-serif", color: "#fff", fontSize: 16, letterSpacing: 1 }}>
              {school.trim() || "Your School"} <span style={{ color: secondaryColor }}>{subject.trim() || "Your Subject"}</span>
            </span>
          </div>
        </div>

        {error && (
          <div style={{ color: "#ff8080", fontSize: 12, marginBottom: 16 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSave}
          style={{
            width: "100%",
            background: canSave ? "#E87722" : "rgba(232,119,34,0.35)",
            color: "#1a1a1a",
            border: "none",
            borderRadius: 6,
            padding: "12px 22px",
            fontFamily: "Oswald, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 0.5,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Setting up your board…" : "Set up my board"}
        </button>
      </form>
    </div>
  );
}
