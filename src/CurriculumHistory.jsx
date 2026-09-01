// "Earlier versions" — lets a teacher see and restore a previous version
// of their units.
//
// api/curriculum.js has been snapshotting every save for a while, up to
// 30 per teacher, and nothing could reach them. This is the way in.
//
// Restoring goes through the ordinary save path (onRestore -> the same
// saveCurriculum every other edit uses), so the version being replaced is
// itself snapshotted first. That is the sentence worth putting in front
// of the teacher: restoring is not a one-way door, and a teacher who is
// nervous about clicking it is exactly the teacher who most needs to.
import { useEffect, useState } from "react";
import { fetchCurriculumHistory, fetchCurriculumVersion } from "./lib/curriculumApi";

const PANEL = "#1c1c1c";
const ACCENT = "var(--board-secondary, #e87722)";

function when(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const rel =
    mins < 2 ? "just now"
    : mins < 60 ? `${mins} minutes ago`
    : mins < 60 * 24 ? `${Math.round(mins / 60)} hours ago`
    : mins < 60 * 24 * 7 ? `${Math.round(mins / (60 * 24))} days ago`
    : "";
  const exact = d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return rel ? `${rel} — ${exact}` : exact;
}

function countLessons(units) {
  return (units || []).reduce(
    (n, u) => n + (Array.isArray(u?.lessons) ? u.lessons.length : 0), 0);
}

export default function CurriculumHistory({ open, onClose, onRestore }) {
  const [versions, setVersions] = useState(null);   // null = still loading
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(null);       // a fetched version
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Fetch fresh every time it opens. The list changes on every save, so
    // a cached one would show a teacher a version list that is missing
    // the edit they just made and came here to undo.
    let cancelled = false;
    setVersions(null); setError(""); setChosen(null);
    fetchCurriculumHistory()
      .then(list => { if (!cancelled) setVersions(list); })
      .catch(() => { if (!cancelled) { setVersions([]); setError("Could not load your earlier versions."); } });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pick = async (id) => {
    setBusy(true); setError("");
    try {
      setChosen(await fetchCurriculumVersion(id));
    } catch {
      setError("Could not open that version.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await onRestore(chosen.units);
      onClose();
    } catch {
      setError("Could not restore that version. Nothing was changed.");
      setBusy(false);
    }
  };

  const label = { fontFamily: "Oswald, sans-serif", color: ACCENT };
  const btn = {
    background: ACCENT, color: "var(--board-secondary-fg, #1c1c1c)", border: "none",
    borderRadius: 6, padding: "8px 16px", fontFamily: "Oswald, sans-serif",
    fontSize: 13, cursor: busy ? "wait" : "pointer",
  };
  const ghost = {
    background: "transparent", border: "1px solid rgba(255,255,255,0.25)",
    color: "rgba(255,255,255,0.75)", borderRadius: 6, padding: "8px 16px",
    fontFamily: "Oswald, sans-serif", fontSize: 13, cursor: "pointer",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Earlier versions of your units"
        onClick={e => e.stopPropagation()}
        style={{
          background: PANEL, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          width: "min(560px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column",
          fontFamily: "Lato, sans-serif", color: "rgba(255,255,255,0.85)",
        }}
      >
        <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ ...label, fontSize: 16, fontWeight: 600 }}>
            {chosen ? "Restore this version?" : "Earlier versions"}
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.5 }}>
            {chosen
              ? "Your units as they are now are saved first, so you can undo this the same way."
              : "Every time your units change, the version before the change is kept here."}
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 12px 12px", flex: 1 }}>
          {error && (
            <div style={{ color: "#ff8a65", fontSize: 13, padding: "10px 10px 4px" }}>{error}</div>
          )}

          {!chosen && versions === null && (
            <div style={{ padding: 18, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Loading…</div>
          )}

          {!chosen && versions !== null && versions.length === 0 && !error && (
            <div style={{ padding: 18, fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              Nothing here yet. Once you rename, add, or delete a unit or lesson,
              the version from before that change shows up here.
            </div>
          )}

          {!chosen && versions?.map(v => (
            <button
              key={v.id}
              onClick={() => pick(v.id)}
              disabled={busy}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px",
                marginTop: 8, color: "inherit", cursor: busy ? "wait" : "pointer",
                fontFamily: "Lato, sans-serif",
              }}
            >
              <div style={{ fontSize: 13.5 }}>{when(v.replacedAt)}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
                {v.unitCount} {v.unitCount === 1 ? "unit" : "units"} · {v.lessonCount}{" "}
                {v.lessonCount === 1 ? "lesson" : "lessons"}
                {v.unitNames?.length ? ` — ${v.unitNames.join(", ")}` : ""}
              </div>
            </button>
          ))}

          {chosen && (
            <div style={{ padding: "10px 10px 0" }}>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
                From {when(chosen.replacedAt)} — {chosen.units.length}{" "}
                {chosen.units.length === 1 ? "unit" : "units"}, {countLessons(chosen.units)} lessons
              </div>
              {chosen.units.map((u, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ ...label, fontSize: 13.5 }}>{u.unit}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2, lineHeight: 1.6 }}>
                    {u.lessons?.length
                      ? u.lessons.map(l => l.title).join(" · ")
                      : "no lessons"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 22px 16px", borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          {chosen ? (
            <>
              <button style={ghost} onClick={() => setChosen(null)} disabled={busy}>Back</button>
              <button style={btn} onClick={restore} disabled={busy}>
                {busy ? "Restoring…" : "Restore these units"}
              </button>
            </>
          ) : (
            <button style={ghost} onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
