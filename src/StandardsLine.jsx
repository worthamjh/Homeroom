import { useMemo, useState } from "react";
import { suggestStandards, searchStandards, parseLessonStandards, serializeLessonStandards, lookupStandard } from "./lib/standards";

/**
 * The learning standards a lesson meets, in two pieces:
 *
 *  - StandardsChips: the codes themselves ("9-12.PS1.A.1"), sitting on
 *    the LEARNING GOALS header line, right-aligned. That is the only
 *    part the live board shows: no label, no extra row -- an admin's eye
 *    already lands on the section title, so the code lives there (Jay,
 *    2026-09-18: "the standard code is enough to show that it is a
 *    standard"; noticeable to an admin, never dominating the screen).
 *    Full wording on hover. In Build each chip also gets an x to remove.
 *
 *  - StandardsLine (default): Build only. The two or three standards
 *    whose wording is closest to the lesson's goals (see
 *    suggestStandards in src/lib/standards.js), each one tap to add,
 *    plus a browse list for when the suggestion is wrong. The teacher
 *    decides; nothing is ever tagged without them.
 *
 * Both exist only when the teacher has added a standards framework in the
 * Design Store (`frameworks` is what they own); with none, nothing.
 *
 * The framework prefix ("MLS") is dropped while everything a teacher
 * owns comes from one family -- on a Missouri board it says nothing an
 * admin does not already know -- and comes back on its own once two
 * families are owned (Missouri and NGSS, say), so codes can be told
 * apart. Several Missouri items together still need no prefix. The "9-12" stays
 * always: it is part of the official code (6-8.PS1.A.1 also exists).
 *
 * Presentational and stateless about the lesson: `value` is the saved
 * JSON string from the lesson's board content, `onSave` writes the next
 * one back through the same path as the other board fields.
 */

const tip = (s) => `${s.framework.short} ${s.code}\n${s.text}${s.note ? `\n\n${s.note}` : ""}`;

const chipBase = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontFamily: "Lato, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1,
  textTransform: "none", padding: "3px 8px", borderRadius: 10, whiteSpace: "nowrap", userSelect: "none",
};

function useChosen(value) {
  const chosenKeys = useMemo(() => parseLessonStandards(value), [value]);
  const chosen = useMemo(() => chosenKeys.map(lookupStandard).filter(Boolean), [chosenKeys]);
  return { chosenKeys, chosen };
}

export function StandardsChips({ frameworks, value, onSave, surface, interactive = false }) {
  const { chosenKeys, chosen } = useChosen(value);
  if (!frameworks || frameworks.length === 0 || chosen.length === 0) return null;

  const accent = surface?.accent || "var(--board-secondary-accent)";
  const bodyText = surface?.bodyText || "rgba(255,255,255,0.88)";
  const dim = surface?.placeholderText || "rgba(255,255,255,0.4)";
  const showPrefix = new Set(frameworks.map(f => f.short)).size > 1;
  const remove = (key) => onSave?.(serializeLessonStandards(chosenKeys.filter(k => k !== key)));

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 5, marginLeft: "auto" }}>
      {chosen.map(s => (
        <span key={s.key} title={tip(s)} style={{ ...chipBase, border: `1px solid ${accent}`, color: bodyText, textShadow: surface?.textShadow }}>
          {showPrefix && <span style={{ opacity: 0.6, fontWeight: 400 }}>{s.framework.short}</span>}
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
    </span>
  );
}

export default function StandardsLine({ frameworks, value, onSave, goalTexts = [], surface, interactive = false }) {
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState("");
  const { chosenKeys } = useChosen(value);
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

  if (!interactive || !frameworks || frameworks.length === 0) return null;

  const accent = surface?.accent || "var(--board-secondary-accent)";
  const bodyText = surface?.bodyText || "rgba(255,255,255,0.88)";
  const dim = surface?.placeholderText || "rgba(255,255,255,0.4)";
  const border = surface?.checkboxBorder || "rgba(255,255,255,0.4)";
  const showPrefix = new Set(frameworks.map(f => f.short)).size > 1;
  const add = (key) => onSave?.(serializeLessonStandards([...chosenKeys, key]));
  const labelStyle = { fontFamily: "Oswald, sans-serif", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: dim, marginRight: 2 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0 2px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={labelStyle}>Suggested standards</span>
        {suggestions.length === 0 ? (
          <span style={{ fontFamily: "Lato, sans-serif", fontSize: 11, color: dim, fontStyle: "italic" }}>
            {goalTexts.length === 0
              ? "add learning goals and Gil-Bilt will suggest standards"
              : chosenKeys.length ? "nothing else close enough — browse for more" : "nothing close enough to suggest — browse instead"}
          </span>
        ) : suggestions.map(s => (
          <button
            key={s.key}
            type="button"
            title={tip(s)}
            onClick={(e) => { e.stopPropagation(); add(s.key); }}
            style={{ ...chipBase, border: `1px dashed ${accent}`, color: accent, background: "transparent", cursor: "pointer" }}
          >
            + {showPrefix ? `${s.framework.short} ` : ""}{s.code}
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

      {browsing && (
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
              <span style={{ fontWeight: 700, color: accent, whiteSpace: "nowrap" }}>+ {showPrefix ? `${s.framework.short} ` : ""}{s.code}</span>
              <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
