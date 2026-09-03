import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/clerk-react";
import { CLERK_CONFIGURED, CLERK_ID_PREFIX } from "./boardConfig";
import { fetchProfile, readCachedProfile } from "./lib/profileApi";
import ProfileOnboarding from "./ProfileOnboarding";
import { LegalLinks } from "./LegalPage";

/**
 * LandingPage — the new "/" route. Used to be the Webster Groves board
 * itself (moved to /board — see main.jsx and the iframe src updates in
 * BuildPage.jsx); Jay's ask was a real front door instead of the demo
 * board doubling as the homepage, now that accounts (Clerk — see
 * boardConfig.js) actually exist.
 *
 * Three states, in order:
 *   1. Signed out (or Clerk not configured at all) → hero + Sign In /
 *      Sign Up, and nothing else. There used to be a secondary link to
 *      the public Webster Groves demo here; it was removed because an
 *      arriving teacher clicking it landed in somebody else's chemistry
 *      class. The demo still exists at /board?teacher=local-teacher for
 *      a pitch, it is just not advertised.
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
        Enter Gil-Bilt Classroom
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
    // The last profile this browser saw for this teacher sends them to
    // their board at once, rather than showing the front door for a beat
    // while the server is asked (Jay: "shows the homepage for a second").
    // The fetch still runs and its answer replaces the cached one.
    const cached = readCachedProfile(teacherId);
    if (cached) setProfile(cached);
    fetchProfile(teacherId)
      .then(p => { if (!cancelled) setProfile(p); })
      .catch(() => { if (!cancelled && !cached) setProfile(null); }); // fail open into onboarding rather than stall forever
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
        {/* No demo link here any more (Jay: "can we get rid of the webster
            groves demo link on the main page altogether"). The front door
            offers exactly one thing now: make an account. The demo board
            itself still exists and is still reachable at
            /board?teacher=local-teacher for a pitch — it is just not
            advertised to arriving teachers, who were only ever going to be
            confused by landing on somebody else's chemistry class. */}
      </SignedOut>

      <SignedIn>
        <div style={{ position: "absolute", top: 20, right: 24 }}>
          <UserButton afterSignOutUrl="/" />
        </div>
        {profile === null ? (
          // A new account's first stop is Build, where the tour starts and
          // the first unit gets added -- not the board, which is empty and
          // has nothing to click yet (Jay, testing sign-up as a stranger:
          // "should there be something that points the user to click the
          // build menu"). A returning teacher with a profile still lands on
          // their board (the effect above).
          <ProfileOnboarding teacherId={teacherId} onComplete={() => navigate("/build")} />
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
      {/* The logo: the GIL-BILT steel-beam wordmark on a framed chalkboard,
          drawn in Claude Design (12a) and exported as SVG with the wordmark
          raster embedded. Jay: "this is what I want the gil bilt logo to
          be" -- "on the login sign in page". The wordmark raster is 327px
          wide, so the logo is shown at a size it stays sharp at. */}
      <img
        src="/logos/gil-bilt-classroom.svg"
        alt="Gil-Bilt Classroom"
        width={420}
        style={{ display: "block", width: "min(420px, 90vw)", height: "auto", margin: "0 auto 18px", borderRadius: 3, boxShadow: "0 10px 30px rgba(0,0,0,0.55)" }}
      />
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
      <LegalLinks style={{ position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center" }} />
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

