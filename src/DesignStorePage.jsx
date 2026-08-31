import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CLERK_CONFIGURED,
  getActiveTeacherId, DEFAULT_TEACHER_ID,
  boardThemeVars, wallBackgroundStyle,
  designCatalog, useOwnedDesignOptions, isDesignOptionIncluded,
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
          Everything Homeroom can put on your board. Add what you want — it turns up in Build under the matching
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
                            onClick={() => design.remove(section.area, opt.id)}
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
    </div>
  );
}
