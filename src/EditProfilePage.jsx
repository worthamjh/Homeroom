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
import { fetchProfile, saveProfile, downloadMyData, deleteMyAccount, deleteClassroom } from "./lib/profileApi";
import { fetchDistrictByDomain, emailDomain } from "./lib/districtApi";
import { LegalLinks } from "./LegalPage";
import { uploadImage, cloudinaryConfigured } from "./lib/cloudinary";
import { getActiveClassroomId, setActiveClassroomId, DEFAULT_CLASSROOM_ID } from "./lib/activeClassroom";

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

  const [exporting,      setExporting]      = useState(false);
  const [exportError,    setExportError]    = useState("");
  const [deleteOpen,     setDeleteOpen]     = useState(false);
  const [deleteTyped,    setDeleteTyped]    = useState("");
  const [deleting,       setDeleting]       = useState(false);
  const [deleteError,    setDeleteError]    = useState("");
  const [teacherName,    setTeacherName]    = useState("");
  const [school,         setSchool]         = useState("");
  const [subject,        setSubject]        = useState("");
  // The partner district this profile belongs to (from the profile, or
  // found now from the sign-in email for a profile made before districts
  // existed), and which of its schools. Picking a school sets the school
  // name; the school's photo shows on any classroom without its own.
  const [district,       setDistrict]       = useState(null);
  const [schoolId,       setSchoolId]       = useState("");
  const pickSchool = (id) => {
    setSchoolId(id);
    const s = district?.schools?.find(x => x.id === id);
    if (s) setSchool(s.name);
  };
  const [primaryColor,   setPrimaryColor]   = useState(DEFAULT_PRIMARY_COLOR);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY_COLOR);
  const [headingFont,    setHeadingFont]    = useState(DEFAULT_HEADING_FONT);
  const [bodyFont,       setBodyFont]       = useState(DEFAULT_BODY_FONT);
  // The home-screen photo. Jay: "can we add the picture of Webster Groves
  // High School to the homepage?" -- a teacher picks a photo of their own
  // school and it fills the board's first screen, whole, with the board's
  // own colour around it where the shapes do not match.
  const [homeImageUrl,   setHomeImageUrl]   = useState("");
  // The board's short address: gil-bilt.com/board/<slug>. Typed here as
  // the teacher likes; lowercased and stripped to letters, digits and
  // hyphens as they type, so what they see is what the link will be.
  const [slug,           setSlug]           = useState("");
  const tidySlug = (v) => v.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-/, "").slice(0, 40);
  // The teacher's classrooms. Each is its own board (Jay: "a profile can
  // have multiple classrooms for teachers who teach more than one
  // course"). The subject, board address and home photo fields below edit
  // the SELECTED classroom; name, school, colours and fonts are the
  // teacher's and apply to every board.
  const [classrooms,     setClassrooms]     = useState([]);
  const [selectedId,     setSelectedId]     = useState(DEFAULT_CLASSROOM_ID);
  // The list with the selected classroom's fields folded back in.
  const withSelected = (list = classrooms) =>
    list.map(c => c.id === selectedId ? { ...c, subject: subject.trim(), slug: slug.replace(/-$/, "") || null, homeImageUrl: homeImageUrl || null } : c);
  const showClassroom = (c) => {
    setSelectedId(c.id);
    setSubject(c.subject || "");
    setSlug(c.slug || "");
    setHomeImageUrl(c.homeImageUrl || "");
  };
  const selectClassroom = (id) => {
    const list = withSelected();
    setClassrooms(list);
    const c = list.find(x => x.id === id);
    if (c) showClassroom(c);
  };
  const addClassroom = () => {
    const list = withSelected();
    const id = `c-${Math.random().toString(36).slice(2, 8)}`;
    const c = { id, name: "New classroom", subject: "", slug: null, homeImageUrl: null };
    setClassrooms([...list, c]);
    showClassroom(c);
  };
  const renameClassroom = (name) => setClassrooms(list => list.map(c => c.id === selectedId ? { ...c, name } : c));
  const selectedClassroom = classrooms.find(c => c.id === selectedId) || null;
  // Deleting a classroom happens right away, not on Save: it wipes that
  // classroom's units, lessons, board and assignments on the server, and
  // a change like that should not sit in a form waiting to be committed
  // with the colour picks. The main classroom has no delete button (it is
  // what a board URL without ?class= means); deleting the account is how
  // that one goes.
  const [deletingClassroom, setDeletingClassroom] = useState(false);
  const removeClassroom = async () => {
    const c = selectedClassroom;
    if (!c || c.id === DEFAULT_CLASSROOM_ID || deletingClassroom) return;
    const label = c.name || c.subject || "this classroom";
    const isNew = !c.slug && !c.subject && !c.homeImageUrl && c.name === "New classroom";
    const msg = isNew
      ? `Remove "${label}"?`
      : `Delete "${label}"?

Its units, lessons, board content, board settings and assignments will be deleted for good. Files it made in your Google Drive stay there.

Your other classrooms are not affected.`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setDeletingClassroom(true);
    setError("");
    try {
      // A classroom added on this page and never saved is not on the
      // server yet; just drop it from the list.
      const saved = savedClassroomIds.includes(c.id);
      if (saved) await deleteClassroom(c.id);
      const rest = withSelected().filter(x => x.id !== c.id);
      setClassrooms(rest);
      setSavedClassroomIds(ids => ids.filter(id => id !== c.id));
      if (getActiveClassroomId() === c.id) setActiveClassroomId(DEFAULT_CLASSROOM_ID);
      showClassroom(rest.find(x => x.id === DEFAULT_CLASSROOM_ID) || rest[0]);
    } catch (err) {
      setError(err?.message || "Couldn't delete that classroom — try again.");
    } finally {
      setDeletingClassroom(false);
    }
  };
  // Which classroom ids the server knows about, so Delete can tell a
  // saved classroom from one added a moment ago.
  const [savedClassroomIds, setSavedClassroomIds] = useState([]);
  const [photoBusy,      setPhotoBusy]      = useState(false);
  const [photoError,     setPhotoError]     = useState("");
  const handlePhoto = async (file) => {
    if (!file) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const { url } = await uploadImage(file);
      setHomeImageUrl(url);
    } catch (err) {
      setPhotoError(err?.message || "Couldn't upload that photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

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
        setSchoolId(p.schoolId || "");
        if (p.district) setDistrict(p.district);
        else {
          // A profile from before districts: see if the sign-in email is
          // a partner's, so the school list and links can be offered now.
          const domain = emailDomain(user?.primaryEmailAddress?.emailAddress || "");
          if (domain) fetchDistrictByDomain(domain).then(d => { if (!cancelled && d) setDistrict(d); }).catch(() => {});
        }
        // Classroom fields come from the classroom list (always present,
        // see api/profile.js), not from the top-level mirror.
        setPrimaryColor(p.primaryColor   || DEFAULT_PRIMARY_COLOR);
        setSecondaryColor(p.secondaryColor || DEFAULT_SECONDARY_COLOR);
        setHeadingFont(p.headingFont   || DEFAULT_HEADING_FONT);
        setBodyFont(p.bodyFont         || DEFAULT_BODY_FONT);
        const list = p.classrooms?.length ? p.classrooms : [{ id: DEFAULT_CLASSROOM_ID, name: p.subject || "My classroom", subject: p.subject || "", slug: p.slug || null, homeImageUrl: p.homeImageUrl || null }];
        setClassrooms(list);
        setSavedClassroomIds(list.map(c => c.id));
        const wanted = new URLSearchParams(window.location.search);
        const startOn = list.find(c => c.id === getActiveClassroomId()) || list[0];
        showClassroom(startOn);
        if (wanted.get("new") === "1") {
          // Arrived from Build's "+ New classroom": start one right away.
          const id = `c-${Math.random().toString(36).slice(2, 8)}`;
          const c = { id, name: "New classroom", subject: "", slug: null, homeImageUrl: null };
          setClassrooms([...list, c]);
          showClassroom(c);
        }
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
      const list = withSelected();
      const main = list.find(c => c.id === DEFAULT_CLASSROOM_ID) || list[0];
      await saveProfile({ teacherId, teacherName: teacherName.trim(), school: school.trim(), subject: main.subject || "", primaryColor, secondaryColor, headingFont, bodyFont, homeImageUrl: main.homeImageUrl || null, slug: main.slug || null, classrooms: list, districtId: district?.id || null, schoolId: district ? (schoolId || null) : null });
      // Land on the classroom that was being edited: Build if we came from
      // there, otherwise its board.
      setActiveClassroomId(selectedId);
      const from = new URLSearchParams(window.location.search).get("from");
      const room = selectedId === DEFAULT_CLASSROOM_ID ? "" : `class=${encodeURIComponent(selectedId)}`;
      navigate(from === "build" ? `/build${room ? "?" + room : ""}` : `/board?teacher=${encodeURIComponent(teacherId)}${room ? "&" + room : ""}`);
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
            {district && (
              <div style={{ marginBottom: 8, fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "Lato, sans-serif", lineHeight: 1.5 }}>
                <strong style={{ color: "rgba(255,255,255,0.85)" }}>{district.name}</strong> is a Gil-Bilt partner: its quick links are on your board's footer, and your school's photo fills any classroom without its own.
              </div>
            )}
            {district?.schools?.length ? (
              <>
                <label style={labelStyle} htmlFor="ep-school-pick">Your school</label>
                <select id="ep-school-pick" value={schoolId} onChange={e => pickSchool(e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
                  <option value="">Choose your school…</option>
                  {district.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <label style={labelStyle} htmlFor="ep-school">School (optional)</label>
                <input id="ep-school" style={fieldStyle} value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. Webster Groves High School" />
              </>
            )}
          </div>
          {/* ── Classrooms ── */}
          <div style={sectionHead}>Classrooms</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif", lineHeight: 1.5, marginBottom: 8 }}>
            One board per course. Pick a classroom to edit its subject, address and photo below; your name, school and colours are shared by all of them.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {classrooms.map(c => (
              <button
                key={c.id} type="button" onClick={() => selectClassroom(c.id)}
                style={{ background: c.id === selectedId ? "var(--board-secondary, #e87722)" : "transparent", color: c.id === selectedId ? "#111" : "rgba(255,255,255,0.8)", border: "1px solid " + (c.id === selectedId ? "var(--board-secondary, #e87722)" : "#555"), borderRadius: 14, padding: "5px 12px", fontFamily: "Lato, sans-serif", fontSize: 12, cursor: "pointer" }}
              >
                {c.name || c.subject || c.id}
              </button>
            ))}
            <button type="button" onClick={addClassroom} style={{ background: "transparent", color: "var(--board-secondary-accent, #e87722)", border: "1px dashed var(--board-secondary-accent, #e87722)", borderRadius: 14, padding: "5px 12px", fontFamily: "Lato, sans-serif", fontSize: 12, cursor: "pointer" }}>
              + New classroom
            </button>
          </div>
          {selectedClassroom && (
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle} htmlFor="ep-classroom-name">Classroom name</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input id="ep-classroom-name" style={{ ...fieldStyle, flex: 1, minWidth: 0 }} value={selectedClassroom.name || ""} onChange={e => renameClassroom(e.target.value)} placeholder="e.g. Chemistry, 3rd hour" />
                {selectedClassroom.id !== DEFAULT_CLASSROOM_ID && (
                  <button
                    type="button"
                    onClick={removeClassroom}
                    disabled={deletingClassroom}
                    title="Delete this classroom and everything on its board"
                    style={{ background: "transparent", color: "#ff8a8a", border: "1px solid rgba(255,138,138,0.5)", borderRadius: 6, padding: "8px 12px", fontFamily: "Lato, sans-serif", fontSize: 12, cursor: deletingClassroom ? "default" : "pointer", whiteSpace: "nowrap", opacity: deletingClassroom ? 0.6 : 1 }}
                  >
                    {deletingClassroom ? "Deleting…" : "Delete classroom"}
                  </button>
                )}
              </div>
              {selectedClassroom.id === DEFAULT_CLASSROOM_ID && classrooms.length > 1 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Lato, sans-serif", marginTop: 4 }}>
                  This is your main classroom; it can't be deleted on its own.
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle} htmlFor="ep-subject">Subject / room for this classroom (optional)</label>
            <input id="ep-subject" style={fieldStyle} value={subject} onChange={e => setSubject(e.target.value)} placeholder={selectedClassroom && selectedClassroom.id !== DEFAULT_CLASSROOM_ID ? `Shown in the board title; blank means "${selectedClassroom.name || "the classroom name"}"` : "e.g. Chemistry, Room 214"} />
          </div>

          {/* ── Board address ── */}
          <div style={sectionHead}>Board Address</div>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle} htmlFor="ep-slug">Short link for your board (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "Lato, sans-serif", fontSize: 13, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>gil-bilt.com/board/</span>
              <input id="ep-slug" style={{ ...fieldStyle, flex: 1, minWidth: 0 }} value={slug} onChange={e => setSlug(tidySlug(e.target.value))} placeholder="webster-groves" spellCheck={false} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif", lineHeight: 1.5, marginTop: 6 }}>
              Made for you from your school and classroom name when you save, if you leave it blank; change it here if you'd like something else. Lowercase letters, numbers and hyphens. It opens your board for anyone once Share is on in Build, and gil-bilt.com/build/<i>address</i> opens Build for this classroom.
            </div>
          </div>

          {/* ── Home screen photo ── */}
          <div style={sectionHead}>Home Screen Photo</div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: "Lato, sans-serif", lineHeight: 1.5, marginBottom: 8 }}>
              Fills the board's first screen, before a unit is picked. Your school building is the classic choice. The whole photo shows, with the board colour around it if the shapes don't match.
            </div>
            {homeImageUrl && (
              <div style={{ background: primaryColor, borderRadius: 6, overflow: "hidden", marginBottom: 8, aspectRatio: "2.1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src={homeImageUrl} alt="Home screen photo" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {cloudinaryConfigured() && (
                <label style={{ ...fieldStyle, width: "auto", display: "inline-block", cursor: photoBusy ? "default" : "pointer", opacity: photoBusy ? 0.6 : 1, textAlign: "center", padding: "9px 14px" }}>
                  {photoBusy ? "Uploading…" : homeImageUrl ? "Choose a different photo" : "Upload a photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={photoBusy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; handlePhoto(f); }} style={{ display: "none" }} />
                </label>
              )}
              {homeImageUrl && (
                <button type="button" onClick={() => setHomeImageUrl("")} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontFamily: "Lato, sans-serif", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
                  Remove photo
                </button>
              )}
            </div>
            {photoError && <div style={{ fontSize: 12, color: "#ff8a65", fontFamily: "Lato, sans-serif", marginTop: 6 }}>{photoError}</div>}
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

        {/* Your data, out of Homeroom and into a file you keep. Here
            rather than buried in Build because it is about the account,
            not about one board -- and because a teacher looking for
            "where is my stuff" looks at their profile. */}
        <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid #333" }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>
            Your data
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExportError("");
              setExporting(true);
              try {
                await downloadMyData();
              } catch (err) {
                setExportError(err.message || "Couldn't build your export.");
              } finally {
                setExporting(false);
              }
            }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.8)", borderRadius: 6, padding: "9px 16px", fontFamily: "Lato, sans-serif", fontSize: 13, cursor: exporting ? "wait" : "pointer" }}
          >
            {exporting ? "Preparing…" : "Download a backup"}
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, margin: "10px 0 0" }}>
            One JSON file with everything Gil-Bilt Classroom stores for you — your units and
            lessons, board content, assignments and settings, plus the last 30 saved
            versions of your curriculum. Readable without Gil-Bilt Classroom, and yours to keep.
          </p>
          {exportError && (
            <p style={{ fontSize: 12, color: "#ff9b8a", margin: "8px 0 0" }}>{exportError}</p>
          )}

          {/* Deleting, below exporting and on purpose: a teacher who lands
              here wanting out sees "take a copy with you" before "destroy
              it". Not a browser confirm() -- Jay asked for in-app dialogs
              rather than browser alerts, and a native confirm gives no room
              to say what is actually about to happen. */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #333" }}>
            {!deleteOpen ? (
              <button
                type="button"
                onClick={() => { setDeleteError(""); setDeleteTyped(""); setDeleteOpen(true); }}
                style={{ background: "transparent", border: "1px solid rgba(255,120,100,0.4)", color: "#ff9b8a", borderRadius: 6, padding: "9px 16px", fontFamily: "Lato, sans-serif", fontSize: 13, cursor: "pointer" }}
              >
                Delete my account
              </button>
            ) : (
              <div style={{ border: "1px solid rgba(255,120,100,0.45)", borderRadius: 8, padding: 16, background: "rgba(255,120,100,0.06)" }}>
                <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 14, color: "#ff9b8a", marginBottom: 8 }}>
                  Delete your account?
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, margin: "0 0 12px" }}>
                  This removes your units and lessons, board content, assignments, settings and
                  saved curriculum versions, and closes your sign-in. It cannot be undone and
                  there is no backup on our side — download one first if you might want it.
                </p>
                <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
                  Type DELETE to confirm
                </label>
                <input
                  value={deleteTyped}
                  onChange={e => setDeleteTyped(e.target.value)}
                  disabled={deleting}
                  autoFocus
                  style={{ background: "#1a1a1a", border: "1px solid #444", borderRadius: 6, color: "#fff", fontFamily: "Lato, sans-serif", fontSize: 13, padding: "8px 10px", width: 160 }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    disabled={deleteTyped !== "DELETE" || deleting}
                    onClick={async () => {
                      setDeleteError("");
                      setDeleting(true);
                      try {
                        await deleteMyAccount();
                        // Straight out, not back to the profile of an
                        // account that no longer exists.
                        window.location.href = "/";
                      } catch (err) {
                        setDeleteError(err.message || "Couldn't delete your account.");
                        setDeleting(false);
                      }
                    }}
                    style={{
                      background: deleteTyped === "DELETE" && !deleting ? "#c0392b" : "#3a2a28",
                      border: "none", borderRadius: 6, color: deleteTyped === "DELETE" && !deleting ? "#fff" : "rgba(255,255,255,0.35)",
                      padding: "9px 16px", fontFamily: "Lato, sans-serif", fontSize: 13,
                      cursor: deleteTyped === "DELETE" && !deleting ? "pointer" : "default",
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete everything"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    disabled={deleting}
                    style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.8)", borderRadius: 6, padding: "9px 16px", fontFamily: "Lato, sans-serif", fontSize: 13, cursor: "pointer" }}
                  >
                    Keep my account
                  </button>
                </div>
                {deleteError && (
                  <p style={{ fontSize: 12, color: "#ff9b8a", margin: "10px 0 0" }}>{deleteError}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <LegalLinks style={{ textAlign: "center", marginTop: 28 }} />
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
