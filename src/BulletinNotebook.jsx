// The notebook pinned to the bulletin board, at its right end.
//
// One per classroom (which template is out is a Bulletin Board setting),
// one copy per unit (the Kami link lives on the unit's board content).
// Tapping it on the live board opens that unit's copy over the slides,
// the same way a Bell Ringer opens. The copy is MADE in Build: the first
// tap there uploads the template PDF to the teacher's Drive, which needs
// their Google sign-in, and a visitor on a shared board must never be
// asked for that -- so with no copy yet, the live board shows the
// notebook dimmed and says where to make it.
//
// Drawn as a real notebook, upright: a navy cover with a paper label on
// it, spiral rings down the spine, a hint of pages at the right and
// bottom edges, and a pushpin through the top. Jay: "i want the notebook
// to look like an actual notebook. That one was squeezed."

const COVER = "#1f3a5f";        // the CER template's own header navy
const COVER_EDGE = "#162a45";
const W = 62;
const H = 80;

export default function BulletinNotebook({ template, unitLabel, kamiUrl, interactive, creating, error, open, onOpen, onCreate }) {
  const hasDoc = !!kamiUrl;
  const canTap = hasDoc || interactive;
  // Short cover text: the template's cover word ("CER") over its edition
  // and the unit, so the four CER notebooks can be told apart on the
  // board. A template without a cover word falls back to its label.
  const shortName = template.cover || template.label.replace(/\s*Notebook$/i, "");
  const editionUnit = template.edition ? `${template.edition} · ${unitLabel}` : unitLabel;
  const topLine = creating ? "Making…" : (!hasDoc && interactive) ? "Make" : shortName;
  const bottomLine = creating ? "" : (!hasDoc && interactive) ? `${shortName} ${editionUnit}` : editionUnit;
  const title = hasDoc ? `Open the ${unitLabel} ${template.label}`
    : interactive ? `Make this unit's ${template.label} in your Drive, then open it`
    : `This unit's ${template.label} has not been made yet. Make it in Build.`;
  const onClick = () => {
    if (creating) return;
    if (hasDoc) onOpen?.();
    else if (interactive) onCreate?.();
  };
  const rings = Array.from({ length: 7 }, (_, i) => 9 + i * 10);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {error && (
        <span style={{ fontSize: 11, color: "#ffb4b4", fontFamily: "Lato, sans-serif", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.6)" }} title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        disabled={!canTap || creating}
        data-tour="tour-bulletin-notebook"
        style={{
          position: "relative", width: W + 6, height: H + 6, padding: 0, border: "none", background: "transparent",
          cursor: canTap && !creating ? "pointer" : "default", opacity: hasDoc || interactive ? 1 : 0.6,
          transform: open ? "rotate(0deg) translateY(-1px)" : "rotate(-2deg)", transition: "transform 140ms, filter 140ms",
          filter: open ? "drop-shadow(0 0 5px var(--board-secondary))" : "drop-shadow(1px 2px 3px rgba(0,0,0,0.5))",
        }}
      >
        {/* Pages: two pale sheets peeking out at the right and bottom. */}
        <span aria-hidden style={{ position: "absolute", left: 6, top: 6, width: W, height: H, background: "#d9dde3", borderRadius: "2px 4px 4px 2px" }} />
        <span aria-hidden style={{ position: "absolute", left: 4, top: 4, width: W, height: H, background: "#f2f4f6", borderRadius: "2px 4px 4px 2px" }} />
        {/* Cover */}
        <span style={{ position: "absolute", left: 2, top: 2, width: W, height: H, background: `linear-gradient(90deg, ${COVER_EDGE} 0 9px, ${COVER} 9px)`, borderRadius: "2px 4px 4px 2px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: 9 }}>
          {/* Paper label on the cover */}
          <span style={{ width: 38, minHeight: 34, background: "#fbfaf5", borderRadius: 2, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3px 2px", gap: 1 }}>
            <span style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: creating ? 9 : 13, fontWeight: 700, letterSpacing: 0.4, color: COVER, lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap" }}>
              {!hasDoc && interactive && !creating && <span aria-hidden style={{ color: "var(--board-secondary)", marginRight: 2 }}>✦</span>}
              {topLine}
            </span>
            {bottomLine && (
              <span style={{ fontFamily: "Lato, sans-serif", fontSize: 7.5, fontWeight: 700, color: "#3a3f47", lineHeight: 1.15, textAlign: "center" }}>
                {bottomLine}
              </span>
            )}
          </span>
        </span>
        {/* Spiral rings through the spine */}
        {rings.map(y => (
          <span key={y} aria-hidden style={{ position: "absolute", left: -1, top: y, width: 9, height: 4, borderRadius: 2, background: "linear-gradient(180deg, #eef0f3, #9aa3ae)", boxShadow: "0 1px 1px rgba(0,0,0,0.5)" }} />
        ))}
        {/* Pushpin */}
        <span aria-hidden style={{ position: "absolute", left: (W + 6) / 2 - 5, top: -3, width: 10, height: 10, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ff7b7b, #c8201f 70%)", boxShadow: "0 1px 2px rgba(0,0,0,0.6)" }} />
      </button>
    </div>
  );
}
