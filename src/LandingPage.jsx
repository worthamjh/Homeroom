import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/clerk-react";
import { CLERK_CONFIGURED, CLERK_ID_PREFIX } from "./boardConfig";
import { fetchProfile } from "./lib/profileApi";
import ProfileOnboarding from "./ProfileOnboarding";

/**
 * LandingPage — the new "/" route. Used to be the Webster Groves board
 * itself (moved to /board — see main.jsx and the iframe src updates in
 * BuildPage.jsx); Jay's ask was a real front door instead of the demo
 * board doubling as the homepage, now that accounts (Clerk — see
 * boardConfig.js) actually exist.
 *
 * Three states, in order:
 *   1. Signed out (or Clerk not configured at all) → hero + Sign In /
 *      Sign Up, plus a secondary link to the public Webster Groves demo
 *      at /board — that link keeps working exactly as before for the
 *      publisher pitch, unauthenticated.
 *   2. Signed in, no profile yet (GET /api/profile came back empty for
 *      this teacherId) → ProfileOnboarding, once.
 *   3. Signed in, profile exists → auto-redirect to /board, where
 *      getActiveTeacherId()'s existing clerk:-prefixed identity already
 *      resolves them to their own blank shell (see boardConfig.js /
 *      WebsterGrovesChemistry.jsx's isBlankTeacher — unchanged by this
 *      pass, this page just finally gives it a front door).
 */
export default function LandingPage() {
  if (!CLERK_CONFIGURED) return <UnauthedLanding />;
  return <ClerkAwareLanding />;
}

// No Clerk key configured (fresh checkout, or a deploy missing the env
// var) — behave the same as every page did before this pass: no auth UI,
// straight into the app. Kept as its own small component (rather than a
// branch inside ClerkAwareLanding) because it must never render a Clerk
// component — those throw outside <ClerkProvider>, and main.jsx only
// mounts one when CLERK_CONFIGURED is true.
function UnauthedLanding() {
  const navigate = useNavigate();
  return (
    <Shell>
      <Hero />
      <button style={primaryButtonStyle} onClick={() => navigate("/board")}>
        Enter Homeroom
      </button>
    </Shell>
  );
}

function ClerkAwareLanding() {
  const { isLoaded, isSignedIn, user } = useUser();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(undefined); // undefined = not checked yet, null = checked & missing

  const teacherId = user ? `${CLERK_ID_PREFIX}${user.id}` : null;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !teacherId) return;
    let cancelled = false;
    fetchProfile(teacherId)
      .then(p => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled) setProfile(null); }); // fail open into onboarding rather than stall forever
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, teacherId]);

  // Profile already exists — nothing left to show here, on to the board.
  useEffect(() => {
    if (profile) navigate("/board");
  }, [profile, navigate]);

  return (
    <Shell>
      <SignedOut>
        <Hero />
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <SignInButton mode="modal">
            <button style={primaryButtonStyle}>Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button style={secondaryButtonStyle}>Sign Up</button>
          </SignUpButton>
        </div>
        <a href="/board" style={demoLinkStyle}>→ View the Webster Groves demo</a>
      </SignedOut>

      <SignedIn>
        <div style={{ position: "absolute", top: 20, right: 24 }}>
          <UserButton afterSignOutUrl="/" />
        </div>
        {profile === null ? (
          <ProfileOnboarding teacherId={teacherId} onComplete={setProfile} />
        ) : (
          <div style={{ color: "rgba(255,255,255,0.5)", fontFamily: "Lato, sans-serif", fontSize: 14 }}>
            Taking you to your board…
          </div>
        )}
      </SignedIn>
    </Shell>
  );
}

function Hero() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 40, color: "#fff", letterSpacing: 1, marginBottom: 10 }}>
        Home<span style={{ color: "#E87722" }}>room</span>
      </div>
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
        Every resource you teach from, in one place — slides, assignments, and the board itself, built up over time as your own.
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#141414",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

const primaryButtonStyle = {
  background: "#E87722",
  color: "#1a1a1a",
  border: "none",
  borderRadius: 6,
  padding: "12px 28px",
  fontFamily: "Oswald, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.5,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  background: "transparent",
  color: "#E87722",
  border: "1px solid #E87722",
  borderRadius: 6,
  padding: "12px 28px",
  fontFamily: "Oswald, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.5,
  cursor: "pointer",
};

const demoLinkStyle = {
  display: "block",
  marginTop: 22,
  color: "rgba(255,255,255,0.4)",
  fontFamily: "Lato, sans-serif",
  fontSize: 13,
  textDecoration: "none",
};
