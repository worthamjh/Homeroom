import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import {
  CLERK_CONFIGURED, CLERK_ID_PREFIX,
  DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR,
  DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT,
  HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS,
  ensureFontsLoaded,
} from "./boardConfig";
import { fetchProfile, saveProfile } from "./lib/profileApi";

/**
 * EditProfilePage — /profile route, linked from the Build page header.
 * Pre-populates every field from the teacher's saved Mongo profile, lets
 * them change anything, and re-saves with the same upsert POST that
 * ProfileOnboarding uses (api/profile.js is already idempotent). After a
 * successful save the teacher is sent back to wherever they came from
 * (Build, board, or the landing page).
 *
 * Deliberate scope: same three text fields + two color pickers as
 * onboarding, PLUS the two new font pickers (heading / body) added in the
 * 2026-08-28 customization pass. Teachers who onboarded before fonts
 * existed will just see the defaults pre-selected — saving once bakes in
 * their explicit choice for the first time.
 */
export default function EditProfilePage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, user } = useUser();
  const teacherId = user ? `${CLERK_ID_PREFIX}${user.id}` : null;

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const [teacherName,    setTeacherName]    = useState("");
  const [school,         setSchool]         = useState("");
  const [subject,        setSubject]        = useState("");
  const [primaryColor,   setPrimaryColor]   = useState(DEFAULT_PRIMARY_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY_COLOR);
  const [headingFont,    setHeadingFont]    = useState(DEFAULT_HEADING_FONT);
  const [bodyFont,       setBodyFont]       = useState(DEFAULT_BODY_FONT);

  // Load existing profile on mount
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !teacherId) { navigate("/"); return; }
    let cancelled = false;
    fetchProfile(teacherId)
      .then(p => {
        if (cancelled || !p) return;
        setTeacherName(p.teacherName   || "");
        setSchool(p.school             || "");
        setSubject(p.subject           || "");
        setPrimaryColor(p.primaryColor   || DEFAULT_PRIMARY_COLOR);
        setSecondaryColor(p.secondaryColor || DEFAULT_SECONDARY_COLOR);
        setHeadingFont(p.headingFont   || DEFAULT_HEADING_FONT);
        setBodyFont(p.bodyFont         || DEFAULT_BODY_FONT);
      })
      .catch(() => {}) // no profile yet — defaults stay
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, teacherId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-load any custom fonts so the preview renders with the chosen face
  useEffect(() => { ensureFontsLoaded([headingFont, bodyFont]); }, [headingFont, bodyFont]);

  const canSave = teacherName.trim().length > 0 && !saving;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await saveProfile({ teacherId, teacherName: teacherName.trim(), school: school.trim(), subject: subject.trim(), primaryColor, secondaryColor, headingFont, bodyFont });
      // Go back to Build if we came from there, otherwise the board
      const from = new URLSearchParams(window.location.search).get("from");
      navigate(from === "build" ? "/build" : "/board");
    } catch (err) {
      setError(err?.message || "Something went wrong — try again.");
      setSaving(false);
    }
  };

  if (!CLERK_CONFIGURED) {
    return <Shell><p style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Lato, sans-serif" }}>Sign-in is not configured on this deployment.</p></Shell>;
  }
  if (!isLoaded || loading) {
    return <Shell><p style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Lato, sans-serif", fontSize: 14 }}>Loading…</p></Shell>;
  }

  const fieldStyle = {
    width: "100%", background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 6, padding: "10px 12px", color: "#fff", fontSize: 14,
    fontFamily: "Lato, sans-serif", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "block", fontFamily: "Oswald, sans-serif", fontSize: 12,
    letterSpacing: 0.5, textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)", marginBottom: 6,
  };
  const sectionHead = {
    fontFamily: "Oswald, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.4)",
    letterSpacing: 1, textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: 6, marginBottom: 16, marginTop: 28,
  };
  const selectStyle = { ...fieldStyle, cursor: "pointer", appearance: "none", paddingRight: 28 };

  return (
    <Shell>
      <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: "32px 28px", maxWidth: 480, width: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, color: "#fff" }}>Edit Profile</div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontFamily: "Lato, sans-serif", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0 }}
          >
            ← Back
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Identity ── */}
          <div style={sectionHead}>Identity</div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="ep-name">Your name</label>
            <input id="ep-name" style={fieldStyle} value={teacherName} onChange={e => setTeacherName(e.target.value)} placeholder="e.g. Ms. Rivera" autoFocus />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="ep-school">School (optional)</label>
            <input id="ep-school" style={fieldStyle} value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. Webster Groves High School" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle} htmlFor="ep-subject">Subject / room (optional)</label>
            <input id="ep-subject" style={fieldStyle} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Chemistry, Room 214" />
          </div>

          {/* ── Colors ── */}
          <div style={sectionHead}>Board Colors</div>
          <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ep-primary">Primary (background)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input id="ep-primary" type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif" }}>{primaryColor}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ep-secondary">Secondary (accent)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input id="ep-secondary" type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)}
                  style={{ width: 40, height: 36, padding: 2, background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif" }}>{secondaryColor}</span>
              </div>
            </div>
          </div>

          {/* ── Fonts ── */}
          <div style={sectionHead}>Fonts</div>
          <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ep-hfont">Heading font</label>
              <div style={{ position: "relative" }}>
                <select id="ep-hfont" style={selectStyle} value={headingFont} onChange={e => setHeadingFont(e.target.value)}>
                  {HEADING_FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▾</span>
              </div>
              <p style={{ fontFamily: `'${headingFont}', sans-serif`, color: "rgba(255,255,255,0.6)", fontSize: 15, marginTop: 6, marginBottom: 0 }}>Aa Sample</p>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="ep-bfont">Body font</label>
              <div style={{ position: "relative" }}>
                <select id="ep-bfont" style={selectStyle} value={bodyFont} onChange={e => setBodyFont(e.target.value)}>
                  {BODY_FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▾</span>
              </div>
              <p style={{ fontFamily: `'${bodyFont}', sans-serif`, color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6, marginBottom: 0 }}>The quick brown fox…</p>
            </div>
          </div>

          {/* ── Live preview bar ── */}
          <div style={{ marginTop: 24, marginBottom: 24, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ background: primaryColor, borderBottom: `4px solid ${secondaryColor}`, padding: "14px 16px", textAlign: "center" }}>
              <span style={{ fontFamily: `'${headingFont}', sans-serif`, color: "#fff", fontSize: 16, letterSpacing: 1 }}>
                {school.trim() || "Your School"} <span style={{ color: secondaryColor }}>{subject.trim() || "Your Subject"}</span>
              </span>
            </div>
            <div style={{ background: secondaryColor, padding: "6px 16px", display: "flex", gap: 8 }}>
              {["Unit 1","Unit 2","Unit 3"].map(u => (
                <span key={u} style={{ fontFamily: `'${headingFont}', sans-serif`, fontSize: 12, fontWeight: 600, color: "#fff", opacity: 0.9 }}>{u}</span>
              ))}
            </div>
            <div style={{ background: "#1e1e1e", padding: "10px 16px" }}>
              <span style={{ fontFamily: `'${bodyFont}', sans-serif`, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Lesson content, goals, and agenda text appear in this font.</span>
            </div>
          </div>

          {error && <div style={{ color: "#ff8080", fontSize: 12, marginBottom: 16 }}>{error}</div>}

          <button
            type="submit"
            disabled={!canSave}
            style={{ width: "100%", background: canSave ? "#E87722" : "rgba(232,119,34,0.35)", color: "#1a1a1a", border: "none", borderRadius: 6, padding: "12px 22px", fontFamily: "Oswald, sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: 0.5, cursor: canSave ? "pointer" : "not-allowed" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#141414", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
      {children}
    </div>
  );
}
