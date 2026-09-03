import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { saveProfile } from "./lib/profileApi";
import { fetchDistrictByDomain, emailDomain } from "./lib/districtApi";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, DEFAULT_HEADING_FONT, DEFAULT_BODY_FONT, HEADING_FONT_OPTIONS, BODY_FONT_OPTIONS, ensureFontsLoaded } from "./boardConfig";

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
  const [headingFont, setHeadingFont] = useState(DEFAULT_HEADING_FONT);
  const [bodyFont, setBodyFont] = useState(DEFAULT_BODY_FONT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A partner district, found from the sign-up email's domain: its
  // colours are filled in, and its schools are offered as a list --
  // picking one sets the school name and the home-screen photo. A
  // teacher can still change any of it. See api/_districts.js.
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "";
  const [district, setDistrict] = useState(null);
  const [schoolId, setSchoolId] = useState("");
  useEffect(() => {
    const domain = emailDomain(email);
    if (!domain) return;
    let cancelled = false;
    fetchDistrictByDomain(domain)
      .then(d => {
        if (cancelled || !d) return;
        setDistrict(d);
        if (d.primaryColor) setPrimaryColor(d.primaryColor);
        if (d.secondaryColor) setSecondaryColor(d.secondaryColor);
        if (d.headingFont) setHeadingFont(d.headingFont);
        if (d.bodyFont) setBodyFont(d.bodyFont);
      })
      .catch(() => {});   // no district, or a hiccup: the plain form is fine
    return () => { cancelled = true; };
  }, [email]);
  const pickSchool = (id) => {
    setSchoolId(id);
    const s = district?.schools?.find(x => x.id === id);
    if (s) setSchool(s.name);
  };
  const pickedSchool = district?.schools?.find(x => x.id === schoolId) || null;

  // Pre-load any non-default font so the live preview renders correctly
  // before the teacher saves — avoids the flash of fallback font on pick.
  useEffect(() => { ensureFontsLoaded([headingFont, bodyFont]); }, [headingFont, bodyFont]);

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
        headingFont,
        bodyFont,
        homeImageUrl: pickedSchool?.homeImageUrl || null,
        districtId: district?.id || null,
        schoolId: pickedSchool?.id || null,
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
        Welcome to Gil-Bilt Classroom
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
        {district && (
          <div style={{ marginBottom: 16, padding: "10px 12px", background: "rgba(232,119,34,0.10)", border: "1px solid rgba(232,119,34,0.35)", borderRadius: 6, fontSize: 12.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.5, fontFamily: "Lato, sans-serif" }}>
            Looks like you're with <strong style={{ color: "#fff" }}>{district.name}</strong>. Its colors and quick links are filled in for you. Pick your school and your board gets its photo too. Change any of it whenever you like.
          </div>
        )}
        {district?.schools?.length ? (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="schoolPick">Your school</label>
            <div style={{ position: "relative" }}>
              <select
                id="schoolPick"
                value={schoolId}
                onChange={e => pickSchool(e.target.value)}
                style={{ ...fieldStyle, appearance: "none", cursor: "pointer", paddingRight: 28 }}
              >
                <option value="">Choose your school…</option>
                {district.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▾</span>
            </div>
          </div>
        ) : (
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
        )}
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

        {/* Font pickers — heading (Oswald-style display) and body (Lato-style
            reading) faces. Both default to the Webster Groves originals so
            a teacher who skips them still gets a coherent look. */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Fonts</label>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "Lato, sans-serif" }}>Heading</div>
              <div style={{ position: "relative" }}>
                <select
                  value={headingFont}
                  onChange={e => setHeadingFont(e.target.value)}
                  style={{ width: "100%", background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "8px 28px 8px 10px", color: "#fff", fontSize: 13, fontFamily: "Lato, sans-serif", cursor: "pointer", appearance: "none" }}
                >
                  {HEADING_FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▾</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontFamily: "Lato, sans-serif" }}>Body</div>
              <div style={{ position: "relative" }}>
                <select
                  value={bodyFont}
                  onChange={e => setBodyFont(e.target.value)}
                  style={{ width: "100%", background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "8px 28px 8px 10px", color: "#fff", fontSize: 13, fontFamily: "Lato, sans-serif", cursor: "pointer", appearance: "none" }}
                >
                  {BODY_FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▾</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live preview of the board title bar + unit nav strip + body text,
            updated live as the teacher tweaks colors and fonts. */}
        <div style={{ marginBottom: 24, borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
          <div style={{ background: primaryColor, borderBottom: `4px solid ${secondaryColor}`, padding: "14px 16px", textAlign: "center" }}>
            <span style={{ fontFamily: `'${headingFont}', sans-serif`, color: "#fff", fontSize: 16, letterSpacing: 1 }}>
              {school.trim() || "Your School"} <span style={{ color: secondaryColor }}>{subject.trim() || "Your Subject"}</span>
            </span>
          </div>
          <div style={{ background: secondaryColor, padding: "5px 12px", display: "flex", gap: 10 }}>
            {["Unit 1","Unit 2","Unit 3"].map(u => (
              <span key={u} style={{ fontFamily: `'${headingFont}', sans-serif`, fontSize: 12, fontWeight: 600, color: "#fff", opacity: 0.9 }}>{u}</span>
            ))}
          </div>
          <div style={{ background: "#1e1e1e", padding: "8px 12px" }}>
            <span style={{ fontFamily: `'${bodyFont}', sans-serif`, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Lesson titles, goals, and agenda text appear in this font.</span>
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
