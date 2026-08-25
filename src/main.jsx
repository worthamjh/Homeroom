import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.jsx'
import LandingPage from './LandingPage.jsx'
import SettingsPage from './SettingsPage.jsx'
import BuildPage from './BuildPage.jsx'
import { useSyncAuthIdentity, CLERK_CONFIGURED } from './boardConfig.js'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Renders nothing — just keeps the sticky active-teacher id (read by
// getActiveTeacherId() in boardConfig.js) in sync with whoever's actually
// signed in via Clerk. Mounted once, inside ClerkProvider but above the
// routes, so it runs no matter which page/tab is open (the board,
// Settings, Build all separately call getActiveTeacherId()).
function AuthIdentitySync() {
  useSyncAuthIdentity();
  return null;
}

const routedApp = (
  <BrowserRouter>
    {/* Only mounted when Clerk is actually configured — it calls
        useUser() internally, which throws outside <ClerkProvider>, and
        this same routedApp tree is reused in the unconfigured branch
        below (no ClerkProvider wraps it there). CLERK_CONFIGURED is a
        build-time constant, so this is a static branch, not a
        conditional hook call. */}
    {CLERK_CONFIGURED && <AuthIdentitySync />}
    <Routes>
      {/* The real front door — was <App /> (the board) directly until the
          2026-08-25 login pass gave Homeroom actual accounts worth a real
          landing page for. See LandingPage.jsx: signed-out visitors get a
          hero + Sign In/Up (or a link to the public demo below); a
          freshly-signed-in teacher with no profile yet gets a short
          onboarding form; everyone else gets redirected straight to
          /board. */}
      <Route path="/" element={<LandingPage />} />
      {/* The actual teaching board — Webster Groves' real content when
          signed out (the public, link-shareable pitch-demo path, exactly
          what "/" used to show directly), or a signed-in teacher's own
          blank-shell board once they're past onboarding. Also embedded
          live via iframe by BuildPage.jsx (?build=1) — see the src there. */}
      <Route path="/board" element={<App />} />
      {/* Opened in its own browser tab from the board's gear icon (see
          TopBar in WebsterGrovesChemistry.jsx) — a real, bookmarkable
          /settings URL rather than an in-app modal, so a teacher can
          flip between the live board and settings side by side. */}
      <Route path="/settings" element={<SettingsPage />} />
      {/* Opened in its own browser tab from the board's 🛠 icon — where
          content (assignments, calendar, eventually units/lessons/
          slides) is actually added and edited. Deliberately never
          inline on the board itself, which can be projected in class
          and should show zero add/edit affordances. See BuildPage.jsx. */}
      <Route path="/build" element={<BuildPage />} />
    </Routes>
  </BrowserRouter>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {CLERK_CONFIGURED ? (
      // afterSignOutUrl="/" — after signing out (from wherever the
      // UserButton menu is open, e.g. /build) land back on the public
      // board rather than staying on a page whose sign-in gate just
      // flipped shut underneath them.
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
        {routedApp}
      </ClerkProvider>
    ) : (
      // No key configured (e.g. a fresh checkout before .env.local is set
      // up) — fall back to running with no auth at all rather than a blank
      // white screen. The board and Settings still work exactly as before
      // this pass; Build's sign-in gate just never shows as satisfied (see
      // the same-fallback check in BuildPage.jsx).
      routedApp
    )}
  </StrictMode>,
)
