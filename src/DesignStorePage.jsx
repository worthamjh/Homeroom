import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CLERK_CONFIGURED,
  getActiveTeacherId, DEFAULT_TEACHER_ID,
  boardThemeVars, wallBackgroundStyle,
  designCatalog, useOwnedDesignOptions, isDesignOptionIncluded,
  useDesignAreaSelections, DESIGN_AREA_DEFAULT_OPTION, DESIGN_AREAS,
  parseLedgeNotebooks, serializeLedgeNotebooks,
} from "./boardConfig";
import { fetchProfile } from "./lib/profileApi";
import BulletinPreview from "./BulletinPreview";

/**
 * DesignStorePage — the /store route, linked from the Build header.
 *
 * The point of a store (Jay, 2026-08-31): "a store that has a ton of
 * different options, then users can add whatever option they want to
 * their profile ... we can go nuts making cool designs and such without
 * overwhelming users. And the users who are about that life can go to the
 * store and go nuts." So the Build settings panel stays short — it lists
 * what ships plus what you've added — and everything else lives here.
 *
 * This page OWNS no design data. It renders designCatalog() from
 * boardConfig.js and writes through useOwnedDesignOptions(), so adding a
 * design later is a catalogue entry, and adding a whole new area is a
 * catalogue entry plus (maybe) one preview case below. That is the part
 * that had to stay cheap.
 *
 * Adding and removing are free and instant. There is no cart, no price
 * and no checkout, because none of that is decided — "store" here means
 * "browse and add", and the ownership record it writes is the same one a
 * paid flow would write later.
 */

// Previews are area-shaped on purpose — a bulletin style previews as a
// strip, a wall colour as a swatch, a layout as two columns. Collapsing
// those into one universal preview blob would cost more than this switch.
function Preview({ preview }) {
  const box = { width: "100%", height: 74, borderRadius: 4, overflow: "hidden", position: "relative", flexShrink: 0 };
  if (!preview) return <div style={{ ...box, background: "#2a2a2a" }} />;

  if (preview.kind === "bulletin") {
    // Same miniature the settings swatch uses, just at full band width.
    return (
      <div style={{ ...box, border: "3px solid #8B6914", boxSizing: "border-box" }}>
        <BulletinPreview style={preview.style} radius={0} />
      </div>
    );
  }

  if (preview.kind === "wall") {
    return <div style={{ ...box, ...wallBackgroundStyle(preview.wallType, "tan") }} />;
  }

  if (preview.kind === "swatch") {
    return <div style={{ ...box, background: preview.color }} />;
  }

  // The accent colours only mean anything against a board, so show one.
  if (preview.kind === "onBoard") {
    return (
      <div style={{ ...box, background: "#2d5a2d", display: "flex", flexDirection: "column", justifyContent: "center", gap: 5, padding: "0 10px" }}>
        <div style={{ height: 4, width: "55%", borderRadius: 2, background: preview.color }} />
        <div style={{ height: 3, width: "85%", borderRadius: 2, background: "rgba(255,255,255,0.5)" }} />
        <div style={{ height: 3, width: "70%", borderRadius: 2, background: "rgba(255,255,255,0.5)" }} />
      </div>
    );
  }

  // Papers and notebooks show the real page, whole and upright, the way
  // an assignment tile shows its file -- a rendering of the very PDF the
  // teacher will get, not a sketch of it. Taller than the other previews
  // on purpose: a Letter page at 74px tall is a white rectangle.
  if (preview.kind === "paper" || preview.kind === "notebook") {
    const thumb = preview.kind === "paper" ? preview.thumb : preview.template?.thumb;
    const pages = preview.kind === "notebook" ? preview.template?.pages : null;
    return (
      <div style={{ ...box, height: 210, background: "#2a2a2a", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ position: "relative", height: "92%", aspectRatio: "8.5 / 11" }}>
          {thumb ? (
            <img src={thumb} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", background: "#fff", borderRadius: 2, boxShadow: "0 2px 6px rgba(0,0,0,0.45)" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#fff", borderRadius: 2, boxShadow: "0 2px 6px rgba(0,0,0,0.45)" }} />
          )}
          {pages != null && (
            <>
              {/* Spiral down the left edge, and the page count, so a
                  notebook reads as a notebook and not a loose sheet. */}
              <div aria-hidden style={{ position: "absolute", left: -4, top: 6, bottom: 6, width: 8, background: "repeating-linear-gradient(180deg, #d5d9df 0 3px, #7a8290 3px 7px)", borderRadius: 2, opacity: 0.95 }} />
              <div style={{ position: "absolute", right: 5, bottom: 5, background: "rgba(20,20,20,0.85)", color: "#fff", fontFamily: "Lato, sans-serif", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3 }}>
                {pages} pages
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (preview.kind === "layout") {
    return (
      <div style={{ ...box, background: "#2d5a2d", display: "grid", gridTemplateColumns: preview.columns, gap: 6, padding: 8 }}>
        <div style={{ background: "rgba(0,0,0,0.45)", borderRadius: 3 }} />
        <div style={{ background: "rgba(255,255,255,0.18)", borderRadius: 3 }} />
      </div>
    );
  }
  return <div style={{ ...box, background: "#2a2a2a" }} />;
}

function StateChip({ children, tone }) {
  const bg = tone === "added" ? "rgba(60,120,60,0.9)" : "rgba(255,255,255,0.12)";
  return (
    <span style={{ fontFamily: "Lato, sans-serif", fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase", padding: "3px 7px", borderRadius: 10, background: bg, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export default function DesignStorePage() {
  const navigate = useNavigate();
  const activeTeacherId = getActiveTeacherId();
  const isBlankTeacher = activeTeacherId !== DEFAULT_TEACHER_ID;
  const design = useOwnedDesignOptions();

  // Previews for bulletin styles and accents are built from the teacher's
  // own colours, so the store shows what THEY would get rather than a
  // stock swatch that turns out to be a different colour once added.
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!isBlankTeacher) return;
    let cancelled = false;
    fetchProfile(activeTeacherId).then(p => { if (!cancelled) setProfile(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isBlankTeacher, activeTeacherId]);

  const themeVars = isBlankTeacher
    ? boardThemeVars(profile?.primaryColor, profile?.secondaryColor)
    : boardThemeVars();
  const catalog = designCatalog(
    isBlankTeacher ? profile?.primaryColor : undefined,
    isBlankTeacher ? profile?.secondaryColor : undefined,
  );

  const addedCount = design.owned.length;
  const selections = useDesignAreaSelections();

  // Removing something the board is actually USING would otherwise leave
  // the store saying "not added" while the board still shows it -- the two
  // contradicting each other, which is what Jay hit with Cork. So a removal
  // that matters asks first, and then moves the board off it, rather than
  // either changing the board silently or letting them disagree.
  //
  // Only the in-use case prompts. Removing something you are not using is
  // not destructive and should not need a dialog.
  //
  // An in-app dialog rather than window.confirm (Jay: "i was expecting the
  // notification to be on the site rather than a browser alert"). This page
  // is plain React with no Google Picker anywhere near it, so unlike the
  // Drive flow there is nothing stopping it drawing its own UI -- which
  // also lets it SHOW the two designs rather than just name them.
  const [pendingRemoval, setPendingRemoval] = useState(null);

  // Notebooks are the one area whose setting is a LIST (any number can hang
  // on the strip), so "in use" means "in the list" and removing one takes
  // it out of the list rather than switching to a default.
  const inUse = (area, current, id) => area === DESIGN_AREAS.NOTEBOOK ? parseLedgeNotebooks(current).includes(id) : current === id;

  const removeOption = (area, opt, options) => {
    const [current] = selections[area] || [];
    if (inUse(area, current, opt.id)) {
      const fallbackId = DESIGN_AREA_DEFAULT_OPTION[area];
      setPendingRemoval({
        area, opt, fallbackId,
        fallback: options.find(o => o.id === fallbackId) || null,
      });
      return;
    }
    design.remove(area, opt.id);
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    const { area, opt, fallbackId } = pendingRemoval;
    const [current, setCurrent] = selections[area] || [];
    if (area === DESIGN_AREAS.NOTEBOOK) setCurrent?.(serializeLedgeNotebooks(parseLedgeNotebooks(current).filter(id => id !== opt.id)));
    else setCurrent?.(fallbackId);
    design.remove(area, opt.id);
    setPendingRemoval(null);
  };

  // Escape cancels, the way any dialog should.
  useEffect(() => {
    if (!pendingRemoval) return;
    const onKey = (e) => { if (e.key === "Escape") setPendingRemoval(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingRemoval]);

  return (
    <div style={{ ...themeVars, minHeight: "100vh", background: "#141414", fontFamily: "Lato, sans-serif", color: "#eee" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: "3px solid var(--board-secondary)", background: "var(--board-primary)", flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: 20, letterSpacing: 0.5 }}>
          🛍 Design Store
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {addedCount === 0 ? "Nothing added yet" : `${addedCount} added`}
          </span>
          <button
            onClick={() => navigate("/build")}
            style={{ background: "transparent", border: "none", color: "var(--board-secondary-accent)", fontSize: 13, cursor: "pointer", fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", letterSpacing: 0.5 }}
          >
            ← BACK TO BUILD
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 20px 60px" }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, margin: "0 0 22px", maxWidth: 640 }}>
          Everything Gil-Bilt Classroom can put on your board. Add what you want — it turns up in Build under the matching
          section, and nothing you don't add clutters that panel. Adding and removing are free and instant, and
          removing something never changes a board that's already using it.
        </p>

        {!CLERK_CONFIGURED && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)", border: "1px solid #333", borderRadius: 5, padding: "10px 12px", marginBottom: 22 }}>
            No sign-in configured, so anything you add here is saved for the local demo board only.
          </div>
        )}

        {catalog.map(section => (
          <section key={section.area} style={{ marginBottom: 34 }}>
            <h2 style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: 15, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--board-secondary-accent)", margin: "0 0 3px" }}>
              {section.label}
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>{section.blurb}</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
              {section.options.map(opt => {
                const included = isDesignOptionIncluded(section.area, opt.id);
                const owned = design.has(section.area, opt.id);
                return (
                  <div key={opt.id} style={{ background: "#1d1d1d", border: `1px solid ${owned ? "var(--board-secondary)" : "#2e2e2e"}`, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 9 }}>
                    <Preview preview={opt.preview} />
                    <div style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: 13, letterSpacing: 0.4 }}>
                      {opt.label}
                    </div>
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      {included ? (
                        <StateChip>Included</StateChip>
                      ) : owned ? (
                        <>
                          <StateChip tone="added">✓ Added</StateChip>
                          <button
                            onClick={() => removeOption(section.area, opt, section.options)}
                            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.6)", borderRadius: 4, fontSize: 11, padding: "4px 9px", cursor: "pointer", fontFamily: "Lato, sans-serif" }}
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => design.add(section.area, opt.id)}
                          style={{ background: "var(--board-secondary)", border: "none", color: "var(--board-secondary-fg)", borderRadius: 4, fontSize: 12, padding: "6px 14px", cursor: "pointer", fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", letterSpacing: 0.5 }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Confirm-removal dialog. Shows BOTH designs rather than naming
          them, since "your board will switch to Primary Color" means very
          little until you see that it is black. Backdrop and Escape both
          cancel; the destructive action is the one that has to be aimed
          at, and it is not the default-looking button. */}
      {pendingRemoval && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Remove ${pendingRemoval.opt.label}?`}
          onClick={() => setPendingRemoval(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#1d1d1d", border: "1px solid #333", borderRadius: 8, padding: "20px 22px", maxWidth: 440, width: "100%", boxShadow: "0 18px 50px rgba(0,0,0,0.6)" }}
          >
            <h2 style={{ fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", fontSize: 17, letterSpacing: 0.5, margin: "0 0 8px" }}>
              Remove &ldquo;{pendingRemoval.opt.label}&rdquo;?
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.65)", margin: "0 0 16px" }}>
              {pendingRemoval.area === DESIGN_AREAS.NOTEBOOK ? (
                <>It is hanging on your bulletin board right now. Remove it and it comes down; any other notebooks stay up.</>
              ) : (
                <>
                  Your board is using it right now. Remove it and the board switches to{" "}
                  <strong style={{ color: "#fff", fontWeight: 600 }}>{pendingRemoval.fallback?.label || "the default"}</strong>.
                </>
              )}
              You can add it back any time.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "rgba(255,255,255,0.4)", marginBottom: 5 }}>Now</div>
                <Preview preview={pendingRemoval.opt.preview} />
              </div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 18, flexShrink: 0, alignSelf: "flex-end", paddingBottom: 24 }}>→</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "rgba(255,255,255,0.4)", marginBottom: 5 }}>After</div>
                <Preview preview={pendingRemoval.fallback?.preview} />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                autoFocus
                onClick={() => setPendingRemoval(null)}
                style={{ background: "var(--board-secondary)", border: "none", color: "var(--board-secondary-fg)", borderRadius: 4, fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "var(--board-heading-font, 'Oswald', sans-serif)", letterSpacing: 0.5 }}
              >
                Keep it
              </button>
              <button
                onClick={confirmRemoval}
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.75)", borderRadius: 4, fontSize: 13, padding: "8px 16px", cursor: "pointer", fontFamily: "Lato, sans-serif" }}
              >
                Remove and switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
