// The notebook resting on the chalk ledge, bottom right of the board.
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
// Drawn as a small closed notebook: a spiral edge, the template's cover
// colour, and the unit on the cover.

const COVER = "#1f3a5f";   // the CER template's own header navy

export default function LedgeNotebook({ template, unitLabel, kamiUrl, interactive, creating, error, open, onOpen, onCreate }) {
  const hasDoc = !!kamiUrl;
  const canTap = hasDoc || interactive;
  const label = creating ? "Making…"
    : hasDoc ? `${template.label} · ${unitLabel}`
    : interactive ? `Make ${unitLabel} ${template.label}`
    : `${template.label} · ${unitLabel}`;
  const title = hasDoc ? `Open the ${unitLabel} ${template.label}`
    : interactive ? `Make this unit's ${template.label} in your Drive, then open it`
    : `This unit's ${template.label} has not been made yet. Make it in Build.`;
  const onClick = () => {
    if (creating) return;
    if (hasDoc) onOpen?.();
    else if (interactive) onCreate?.();
  };
  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {error && (
        <span style={{ fontSize: 11, color: "#ffb4b4", fontFamily: "Lato, sans-serif", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        disabled={!canTap || creating}
        data-tour="tour-ledge-notebook"
        style={{
          display: "flex", alignItems: "center", gap: 0, padding: 0, border: "none", background: "transparent",
          cursor: canTap && !creating ? "pointer" : "default", opacity: hasDoc || interactive ? 1 : 0.55,
          filter: open ? "drop-shadow(0 0 4px var(--board-secondary))" : "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
          transform: open ? "translateY(-1px)" : "none", transition: "transform 120ms, filter 120ms",
        }}
      >
        {/* Spiral edge */}
        <span aria-hidden style={{ width: 7, height: 26, borderRadius: "2px 0 0 2px", background: `repeating-linear-gradient(180deg, #d5d9df 0 2px, #7a8290 2px 4px)`, opacity: 0.9, display: "block" }} />
        {/* Cover */}
        <span style={{ height: 26, boxSizing: "border-box", padding: "0 10px 0 8px", borderRadius: "0 3px 3px 0", background: COVER, color: "#fff", fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, borderLeft: "1px solid rgba(255,255,255,0.25)" }}>
          {!hasDoc && interactive && !creating && <span aria-hidden style={{ color: "var(--board-secondary)" }}>✦</span>}
          {label}
        </span>
      </button>
    </div>
  );
}
