import { useMemo, useState } from "react";
import { suggestStandards, searchStandards, parseLessonStandards, serializeLessonStandards, lookupStandard } from "./lib/standards";

/**
 * StandardsLine — the learning standards a lesson meets, printed under
 * its Learning Goals as a row of small code chips ("MLS 9-12.PS1.A.1"),
 * each with the standard's full text on hover.
 *
 * It exists only when the teacher has added a standards framework in the
 * Design Store (`frameworks` is what they own); with none it renders
 * nothing at all. On the live board it is the chips and nothing else,
 * and no chips means no row -- an empty "Standards" heading is exactly
 * the clutter Jay did not want.
 *
 * In Build it also SUGGESTS: the two or three standards whose wording is
 * closest to the lesson's goals (see suggestStandards in src/lib/
 * standards.js), each one tap to add, plus a browse list for when the
 * suggestion is wrong. The teacher decides; nothing is ever tagged
 * without them.
 *
 * Presentational and stateless about the lesson: `value` is the saved
 * JSON string from the lesson's board content, `onSave` writes the next
 * one back through the same path as the other board fields.
 */
export default function StandardsLine({ frameworks, value, onSave, goalTexts = [], surface, interactive = false }) {
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState("");

  const chosenKeys = useMemo(() => parseLessonStandards(value), [value]);
  const chosen = useMemo(() => chosenKeys.map(lookupStandard).filter(Boolean), [chosenKeys]);
  const goalsSignature = goalTexts.join("\n");
  const suggestions = useMemo(
    () => interactive ? suggestStandards(goalTexts, frameworks, { limit: 3, exclude: chosenKeys }) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactive, goalsSignature, frameworks, chosenKeys],
  );
  const browseResults = useMemo(
    () => browsing ? searchStandards(frameworks, query, 12).filter(s => !chosenKeys.includes(s.key)) : [],
    [browsing, query, frameworks, chosenKeys],
  );

  if (!frameworks || frameworks.length === 0) return null;
  if (!interactive && chosen.length === 0) return null;

  const accent = surface?.accent || "var(--board-secondary-accent)";
  const bodyText = surface?.bodyText || "rgba(255,255,255,0.88)";
  const dim = surface?.placeholderText || "rgba(255,255,255,0.4)";
  const border = surface?.checkboxBorder || "rgba(255,255,255,0.4)";

  const add = (key) => onSave?.(serializeLessonStandards([...chosenKeys, key]));
  const remove = (key) => onSave?.(serializeLessonStandards(chosenKeys.filter(k => k !== key)));
  const tip = (s) => `${s.framework.short} ${s.code}\n${s.text}${s.note ? `\n\n${s.note}` : ""}`;

  const chipBase = {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontFamily: "Lato, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1,
    padding: "3px 8px", borderRadius: 10, whiteSpace: "nowrap", userSelect: "none",
  };
  const labelStyle = { fontFamily: "Oswald, sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: dim, marginRight: 2 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0 2px" }}>
      {/* What is chosen: the only part that shows on the live board. */}
      {(chosen.length > 0 || interactive) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span style={labelStyle}>Standards</span>
          {chosen.map(s => (
            <span key={s.key} title={tip(s)} style={{ ...chipBase, border: `1px solid ${border}`, color: bodyText, textShadow: surface?.textShadow }}>
              <span style={{ opacity: 0.6, fontWeight: 400 }}>{s.framework.short}</span>
              {s.code}
              {interactive && (
                <button
                  type="button"
                  aria-label={`Remove ${s.code}`}
                  onClick={(e) => { e.stopPropagation(); remove(s.key); }}
                  style={{ background: "transparent", border: "none", color: dim, cursor: "pointer", padding: 0, marginLeft: 2, fontSize: 12, lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {interactive && chosen.length === 0 && (
            <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: dim, fontStyle: "italic" }}>none yet</span>
          )}
        </div>
      )}

      {/* Build only: suggestions and the browse list. */}
      {interactive && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span style={labelStyle}>Suggested</span>
          {suggestions.length === 0 ? (
            <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: dim, fontStyle: "italic" }}>
              {goalTexts.length === 0 ? "add learning goals and Gil-Bilt will suggest standards" : "nothing close enough to suggest — browse instead"}
            </span>
          ) : suggestions.map(s => (
            <button
              key={s.key}
              type="button"
              title={tip(s)}
              onClick={(e) => { e.stopPropagation(); add(s.key); }}
              style={{ ...chipBase, border: `1px dashed ${accent}`, color: accent, background: "transparent", cursor: "pointer" }}
            >
              + {s.code}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setBrowsing(b => !b); }}
            style={{ background: "transparent", border: "none", color: dim, cursor: "pointer", fontFamily: "Lato, sans-serif", fontSize: 11, textDecoration: "underline", padding: 0 }}
          >
            {browsing ? "close" : "browse all"}
          </button>
        </div>
      )}

      {interactive && browsing && (
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: 8 }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${frameworks.map(f => f.short).join(", ")} by code or wording…`}
            style={{ fontFamily: "Lato, sans-serif", fontSize: 12, padding: "5px 8px", borderRadius: 4, border: `1px solid ${border}`, background: "rgba(0,0,0,0.3)", color: "#fff", outline: "none" }}
          />
          {browseResults.length === 0 ? (
            <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: dim, fontStyle: "italic", padding: "2px 2px" }}>no matches</span>
          ) : browseResults.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => add(s.key)}
              title={tip(s)}
              style={{ display: "flex", alignItems: "baseline", gap: 8, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "3px 2px", color: bodyText, fontFamily: "Lato, sans-serif", fontSize: 11, lineHeight: 1.35 }}
            >
              <span style={{ fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>+ {s.code}</span>
              <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
