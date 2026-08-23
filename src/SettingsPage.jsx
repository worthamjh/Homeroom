import { useEffect } from "react";

/**
 * SettingsPage — the gear icon used to open a standalone settings page
 * (a live board preview on the left, a categorized formatting panel on
 * the right). That panel now lives inside /build instead (see
 * BoardSettingsPanel.jsx and BuildPage.jsx) — Jay's ask was one "Build"
 * page for both content editing and board formatting, rather than two
 * separate pages to remember and flip between. The /settings route stays
 * registered (see main.jsx) purely so an old bookmark, a saved shortcut,
 * or muscle memory still lands somewhere useful instead of a 404 — this
 * just forwards straight to /build, preserving any query string (e.g.
 * ?teacher=...) so a blank-shell teacher's identity carries over.
 */
export default function SettingsPage() {
  useEffect(() => {
    window.location.replace("/build" + window.location.search);
  }, []);

  return null;
}
