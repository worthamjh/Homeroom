import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/clerk-react";
import { CLERK_CONFIGURED, CLERK_ID_PREFIX, ensureFontsLoaded } from "./boardConfig";
import { fetchProfile, readCachedProfile } from "./lib/profileApi";
import ProfileOnboarding from "./ProfileOnboarding";
import { LegalLinks } from "./LegalPage";
import "./frontDoor.css";

const TOUR_ID = "dcGSZKX0wfw";

/**
 * LandingPage — the "/" route. Used to be the Webster Groves board
 * itself (moved to /board — see main.jsx and the iframe src updates in
 * BuildPage.jsx); Jay's ask was a real front door instead of the demo
 * board doubling as the homepage, now that accounts (Clerk — see
 * boardConfig.js) actually exist.
 *
 * Three states, in order:
 *   1. Signed out (or Clerk not configured at all) → the front door:
 *      hero + Sign In / Sign Up at the top, and since 2026-10-11 the
 *      page below it that says what Gil-Bilt is (FrontDoor). Until then
 *      the page was the logo and two buttons and nothing else, because
 *      there was nothing else to show; now there is the tour, the clips
 *      and the pilot sheet, and the people arriving cold (a candidate
 *      teacher, a department head holding the sheet) are exactly the
 *      ones who need it. There used to be a secondary link to the public
 *      Webster Groves demo here; it was removed because an arriving
 *      teacher clicking it landed in somebody else's chemistry class.
 *      The demo still exists at /board?teacher=local-teacher for a
 *      pitch, it is just not advertised.
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
    <>
      <SignedOut>
        <FrontDoor />
      </SignedOut>

      <SignedIn>
        <Shell>
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
        </Shell>
      </SignedIn>
    </>
  );
}

// What you do, and what the board does with it. Every right-hand line is
// something the app does today (checked against the code on 2026-10-11);
// the left-hand line names the one real action by its on-screen label.
// Jay's rule for this copy: say what is automated, never what a teacher
// has to do, because a feature list reads as a to-do list.
const DOINGS = [
  ["Add a unit and a lesson.", "Puts them across the top, one tap each. Nothing to save, and next year they are still there."],
  ["Pick a deck from Google Drive.", "Shows the slides on the board's screen. Nothing is converted or uploaded twice."],
  ["Pick a handout from Drive.", "Gives it a thumbnail on the lesson and under Assignments & Classwork, and opens it on the board."],
  ["Type the essential question, goals and agenda once.", "Keeps them up every day the lesson is up. Goals get checked off on the board as the class hits them."],
  ["Click Create Bell Ringer doc.", "Makes the doc, files it in your Drive, and opens it over the slides to write on. Exit slips work the same way."],
  ["Add a timer from the Store.", "Hangs it on the bulletin strip and starts it on its own whenever a Bell Ringer goes up, while you take attendance."],
  ["Click Build with AI.", "Finds about five videos a lesson from the learning goals, for a lesson, a unit or a whole course. You take out any that don't fit."],
  ["Tap the standards that fit.", "Suggests them from your goals and posts them as small codes, with the full wording on hover."],
  ["Tap Make on a class notebook.", "Builds the whole notebook as a PDF, files it in your Drive named for the course and unit, and opens it in Kami ready to write in. One per unit, and what the class writes stays."],
  ["Choose a calendar once.", "Shows it on every unit page."],
  ["Say a lesson runs three days.", "Gives it three sliding boards, stacked like the old rooms, each with that day's goals and agenda."],
  ["Drag the board's tag to the bookmarks bar.", "Opens on any screen with no Gil-Bilt sign-in: the classroom computer, a laptop, a substitute's screen. Only you can change it."],
];

// Frames from the September tour recordings, browser chrome cropped off,
// 1600px wide, in public/front-door/.
const STILLS = [
  { src: "/front-door/build.jpg", alt: "Build: the board preview on the left with learning goals and agenda typed in, the settings panel on the right", lead: "Build.", text: "Everything on the board is set up here: units and lessons, slides picked from Drive, goals and agenda typed once. Every change is on the board as you make it. There is no save button." },
  { src: "/front-door/store.jpg", alt: "The Design Store: a grid of bulletin board styles and wall colours, each with an Add button", lead: "The Store.", text: "Bulletin board styles, wall colours, papers, notebooks, timers and standards. Everything in it is free." },
  { src: "/front-door/share.jpg", alt: "Build with the Share panel open: a view-only link, a Copy button, and a tag to drag onto the bookmarks bar", lead: "Share.", text: "One view-only link, dragged to the bookmarks bar. It opens on the classroom computer or a substitute's laptop with no Gil-Bilt sign-in." },
  { src: "/front-door/bellringer.jpg", alt: "A bell ringer question open over the slides on the board, ready to be written on in Kami", lead: "Bell Ringer.", text: "One click. Gil-Bilt makes the doc, files it in your Drive, and opens it over the slides to write on in front of the room. The timer starts itself." },
];

// The signed-out page. The fold is what it always was (logo, one line,
// two buttons); the rest answers "what is this" for someone who has not
// decided to make an account yet. The copy is the pilot sheet's, already
// checked against Jay's wording rules: he is a high school science
// teacher, the format was developed in a K-5 classroom, teacher first,
// never "replaces the whiteboard routine". The pilot sheet itself is
// served as a PDF from public/ for a department head to print.
function FrontDoor() {
  // The board loads its fonts when a teacher's theme is applied; the front
  // door is seen before any of that, so it asks for the two defaults itself
  // (no-op once the <link> exists).
  useEffect(() => { ensureFontsLoaded(["Oswald", "Lato"]); }, []);
  return (
    <div className="fd">
      <header className="fd-hero">
        <Hero />
        <div className="fd-buttons">
          <SignInButton mode="modal">
            <button style={primaryButtonStyle}>Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button style={secondaryButtonStyle}>Sign Up</button>
          </SignUpButton>
        </div>
        <a className="fd-tourlink" href="#tour">Watch the five-minute tour</a>
        <div className="fd-hint">Free · No student accounts · Built in St. Louis, Missouri</div>
      </header>

      <main className="fd-main">
        <section className="fd-section" id="what">
          <p className="fd-eyebrow">What it is</p>
          <h2>The classroom board, projected.</h2>
          <p className="fd-lede">Gil-Bilt Classroom is a web board a teacher puts on the smartboard at the start of every class. <b>The day's agenda, essential question, learning goals, slides and handouts are all on it</b>, set up once and updated in minutes, where every student can read them from any seat. Most of it is one tap, and nothing needs saving.</p>
          <p>It was built by a high school science teacher for his own room. The format was developed in a K-5 classroom, where a predictable board made each day legible for the students who needed it most, and it carried straight into high school science.</p>
          <div className="fd-facts">
            <span>Free</span>
            <span>Teacher accounts only</span>
            <span>Files stay in your Drive</span>
            <span>Nothing to install</span>
          </div>
        </section>

        <section className="fd-section" id="tour">
          <p className="fd-eyebrow">See it</p>
          <h2>The five-minute tour</h2>
          <p>Where the format came from, then the whole board: Build, slides and handouts from Drive, bell ringers and exit slips, notebooks, the calendar, and sharing a board with no Gil-Bilt sign-in.</p>
          <div className="fd-video">
            <iframe
              src={`https://www.youtube.com/embed/${TOUR_ID}?rel=0`}
              title="Gil-Bilt Classroom: the Tour"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </section>

        <section className="fd-section" id="board">
          <p className="fd-eyebrow">On the board</p>
          <h2>Set it up once. The board does the rest.</h2>
          <div className="fd-board">
            <h3>Your part, and the board's part</h3>
            <div className="fd-doings" role="table" aria-label="What you do and what the board does">
              <div className="fd-head fd-you" role="columnheader">You</div>
              <div className="fd-head fd-does" role="columnheader">The board</div>
              {DOINGS.map(([you, does]) => (
                <Doing key={you} you={you} does={does} />
              ))}
            </div>
            <p className="fd-chalk">Build a unit once and it is built for good. Next year it is still there.</p>
          </div>
        </section>

        <section className="fd-section" id="look">
          <p className="fd-eyebrow">How it works</p>
          <h2>Four screens a teacher lives on.</h2>
          <div className="fd-stills">
            {STILLS.map(s => (
              <figure key={s.src}>
                <img src={s.src} alt={s.alt} width="1600" height="748" loading="lazy" />
                <figcaption><b>{s.lead}</b>{s.text}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="fd-section" id="district">
          <p className="fd-eyebrow">For a department or a district</p>
          <h2>Free for any teacher. Set up together, if you like.</h2>
          <div className="fd-cols">
            <div className="fd-card">
              <h3>For a department</h3>
              <p>Gil-Bilt is free for any teacher, with nothing to install and no contract. If a department or a district wants to try it together, I will run one 45-minute setup session, in person or on a call, as PD. Teachers leave with a working board.</p>
              <p>After that it is direct email to me, and the problems you find go to the front of the line. Any subject; science is where it started.</p>
            </div>
            <div className="fd-card">
              <h3>For the district</h3>
              <ul>
                <li>Teacher accounts only. No student accounts and no student data, so no student privacy agreement is needed.</li>
                <li>Runs in a browser on any smartboard or laptop. Nothing to install or whitelist beyond gil-bilt.com.</li>
                <li>Files stay in the teacher's Google Drive. The app can see only the files it creates or the teacher picks.</li>
                <li>Sign-in through Google or email, with the district's own accounts.</li>
                <li>A board's link drops into Google Classroom or a Canvas module like any other link. Nothing to install on the district's side.</li>
                <li>No ads, nothing sold, nothing used to train AI.</li>
                <li>A teacher can export or delete everything from their profile page.</li>
              </ul>
            </div>
          </div>
          <div className="fd-cta">
            <a className="fd-btn" href="/pilot-sheet.pdf" target="_blank" rel="noopener noreferrer">The pilot sheet (PDF)</a>
            <div className="fd-contact"><b>Jay Wortham</b>, high school science teacher and developer · <a href="mailto:gilbiltclassroom@gmail.com">gilbiltclassroom@gmail.com</a></div>
          </div>
        </section>
      </main>

      <footer className="fd-foot">
        <span>Gil-Bilt Classroom</span><span>·</span><span>Built in St. Louis, Missouri</span><span>·</span>
        <LegalLinks style={{ display: "inline" }} />
      </footer>
    </div>
  );
}

// One row of the table. The small "You" / "The board" labels only show on
// a phone, where the two columns stack (see frontDoor.css).
function Doing({ you, does }) {
  return (
    <>
      <div className="fd-you"><span className="fd-lbl">You</span>{you}</div>
      <div className="fd-does"><span className="fd-lbl">The board</span>{does}</div>
    </>
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
      {/* The line under the logo says what the thing is, in nouns a
          teacher recognises. The old one ("every resource you teach from,
          in one place") could have described a filing cabinet. */}
      <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
        The classroom board, projected. Slides, goals, agenda and handouts for every lesson, on the smartboard at the bell.
      </div>
    </div>
  );
}

// The centred one-screen frame the signed-in states still use (onboarding,
// and the beat before the redirect to the board).
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
