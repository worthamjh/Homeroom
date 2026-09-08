import { Link } from "react-router-dom";

/**
 * /help -- the nine short how-to clips, embedded from the Gil-Bilt
 * Classroom: How-To playlist on YouTube, grouped the way a teacher meets
 * the features: content first, then the board, then its look, then
 * sharing. Linked from Build's header ("? Help") and named in the guided
 * tour's last step, so a teacher who forgets how the calendar works has
 * somewhere to look besides re-running the tour.
 *
 * Adding a clip: append to CLIPS with its YouTube id and a one-line
 * "covers" note. The playlist order on YouTube is the order here.
 */
const PLAYLIST_ID = "PLGPAUlGb-GUo";
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;

const GROUPS = [
  {
    heading: "Getting started",
    clips: [
      { id: "GBapX_W9pU4", title: "Add a unit and a lesson", covers: "The wrench icon that opens Build, adding a unit and a lesson, and the rename, hide and remove buttons on every row." },
      { id: "QVhFwbf98Ns", title: "Put your slides on the board", covers: "Add Slides inside a lesson, picking a deck from Google Drive, and the deck filling the smartboard." },
      { id: "Bin5JZ-iLLY", title: "Attach an assignment", covers: "Add Assignment under the slides, and where it shows up: on the lesson, on the unit page, and under Assignments & Classwork." },
    ],
  },
  {
    heading: "The board",
    clips: [
      { id: "BjuKcnSYNS8", title: "Choose what's on the board", covers: "Board Content: turning sections on and off, dragging them into order, and editing the text. The essential question belongs to the unit." },
      { id: "3TyqvPm8G94", title: "Sliding boards", covers: "Number of boards under Blackboard. Each board is one class period of the lesson; the corner arrow slides the front one out of the way." },
      { id: "xdnXmarmNXk", title: "A class calendar", covers: "Add Calendar on a unit page, choosing one of your Google Calendars or pasting a link. Each unit shows the same calendar." },
    ],
  },
  {
    heading: "How it looks",
    clips: [
      { id: "9henQ_IWBSs", title: "The wall, the strip, and the surface", covers: "Background, Bulletin Board and Blackboard: the wall and its colour, the strip above the board, chalk or whiteboard, and the heading colour." },
      { id: "GtAAZNcgu7s", title: "Notebooks", covers: "Notebooks in the Store, ordering them on the bulletin strip, and Make, which turns one into a real Drive file named for the course and unit." },
    ],
  },
  {
    heading: "Sharing",
    clips: [
      { id: "cKOplzMDl4A", title: "Share your board", covers: "Share in Build switches on a view-only link, the tag you drag to the bookmarks bar, and opening the board on another screen with no Gil-Bilt sign-in." },
    ],
  },
];

const page = { minHeight: "100vh", background: "#141414", color: "rgba(255,255,255,0.85)", fontFamily: "Lato, sans-serif", padding: "40px 24px 64px" };
const inner = { maxWidth: 860, margin: "0 auto", lineHeight: 1.6, fontSize: 15 };
const h1 = { fontFamily: "Oswald, sans-serif", fontSize: 28, color: "#fff", margin: "0 0 4px", letterSpacing: 0.5 };
const h2 = { fontFamily: "Oswald, sans-serif", fontSize: 18, color: "#E87722", margin: "36px 0 12px", letterSpacing: 0.5, textTransform: "uppercase" };
const h3 = { fontFamily: "Oswald, sans-serif", fontSize: 17, color: "#fff", margin: "0 0 4px", letterSpacing: 0.3 };
const muted = { color: "rgba(255,255,255,0.5)", fontSize: 13 };
const link = { color: "#E87722", textDecoration: "none" };
// A 16:9 box the player fills, so the page does not jump as embeds load.
const frameBox = { position: "relative", width: "100%", paddingTop: "56.25%", background: "#000", borderRadius: 6, overflow: "hidden", marginTop: 10 };
const frame = { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 };

function Clip({ id, title, covers, index }) {
  return (
    <section style={{ marginBottom: 32 }} id={`clip-${index}`}>
      <h3 style={h3}>{title}</h3>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>{covers}</div>
      <div style={frameBox}>
        {/* loading="lazy": nine players on one page would otherwise all
            fetch at once; this way each loads as it scrolls into view. */}
        <iframe
          style={frame}
          src={`https://www.youtube.com/embed/${id}?rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </section>
  );
}

export default function HelpPage() {
  let n = 0;
  return (
    <div style={page}>
      <div style={inner}>
        <h1 style={h1}>How-To</h1>
        <div style={muted}>Nine short clips, under a minute each. Sound on, or read the captions.</div>
        <p style={{ marginTop: 14 }}>
          Everything on the board is set up in Build, the page behind the 🛠 icon. These clips show one thing each, in the order a teacher usually needs them. They are also on YouTube as a{" "}
          <a style={link} href={PLAYLIST_URL} target="_blank" rel="noopener noreferrer">playlist</a>.
        </p>
        {GROUPS.map(g => (
          <div key={g.heading}>
            <h2 style={h2}>{g.heading}</h2>
            {g.clips.map(c => <Clip key={c.id} {...c} index={++n} />)}
          </div>
        ))}
        <div style={{ ...muted, marginTop: 40 }}>
          Something these do not cover? Email <a style={link} href="mailto:worthamjh@gmail.com">worthamjh@gmail.com</a>.
          {" · "}<Link style={link} to="/build">Back to Build</Link>
        </div>
      </div>
    </div>
  );
}
