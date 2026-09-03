import { Link, useLocation } from "react-router-dom";

/**
 * /privacy and /terms -- the Privacy Policy and Terms of Service, in plain
 * language, written from what the app actually does (see the notes on
 * each section). Linked from the front door, the Profile page and the
 * board's footer. Districts ask for these before a pilot; Google expects a
 * published privacy policy for an app that uses sign-in and Drive.
 *
 * Operator details (OPERATOR below) are the one thing not derivable from
 * the code. Jay is the operator as an individual until there is an entity.
 * A lawyer should review before a district signs anything.
 */
const OPERATOR = {
  name: "Jay Wortham",
  product: "Gil-Bilt Classroom",
  email: "worthamjh@gmail.com",
  site: "gil-bilt.com",
  state: "Missouri",
  updated: "September 3, 2026",
};

const page = { minHeight: "100vh", background: "#141414", color: "rgba(255,255,255,0.85)", fontFamily: "Lato, sans-serif", padding: "40px 24px 64px" };
const inner = { maxWidth: 760, margin: "0 auto", lineHeight: 1.65, fontSize: 15 };
const h1 = { fontFamily: "Oswald, sans-serif", fontSize: 28, color: "#fff", margin: "0 0 4px", letterSpacing: 0.5 };
const h2 = { fontFamily: "Oswald, sans-serif", fontSize: 18, color: "#E87722", margin: "28px 0 8px", letterSpacing: 0.5, textTransform: "uppercase" };
const muted = { color: "rgba(255,255,255,0.5)", fontSize: 13 };
const link = { color: "#E87722", textDecoration: "none" };

function Privacy() {
  return (
    <>
      <h1 style={h1}>Privacy Policy</h1>
      <div style={muted}>{OPERATOR.product} · Last updated {OPERATOR.updated}</div>

      <p>{OPERATOR.product} ("Gil-Bilt", "we") is a website at {OPERATOR.site} that gives a teacher a daily classroom board: slides, an agenda, learning goals, assignments and links, shown on a projector. This policy says what information the site handles, why, and what you can do about it. It is written to be read, not skimmed past. If anything here is unclear, email {OPERATOR.email}.</p>

      <h2 style={h2}>The short version</h2>
      <ul>
        <li>Teachers have accounts. Students do not. Gil-Bilt collects no information about students.</li>
        <li>We keep what you give us to run your board: your name, email, school, colours, and what you put on the board.</li>
        <li>We do not sell information, show ads, or share your information with anyone except the services that run the site, listed below.</li>
        <li>You can download everything we hold about you, or delete your account and all of it, from your Profile page at any time.</li>
      </ul>

      <h2 style={h2}>Who Gil-Bilt is for</h2>
      <p>Gil-Bilt is a tool for teachers. Only a teacher creates an account. A board can be shown on a classroom screen and, if the teacher chooses, shared by link for anyone to view, but viewing a board requires no account and collects nothing about the viewer beyond ordinary web server logs. Gil-Bilt is not directed at children, and we do not knowingly collect personal information from anyone under 13. If you believe a child has given us personal information, email {OPERATOR.email} and we will delete it.</p>

      <h2 style={h2}>What we collect, and why</h2>
      <p><strong>Your account.</strong> Sign-in is handled by Clerk, an authentication service. When you sign up, Clerk receives your email address and, if you sign in with Google or Microsoft, your name and the account identifier those services provide. Gil-Bilt stores an account identifier and uses it to tell your board from everyone else's. We do not see or store your password.</p>
      <p><strong>Your profile.</strong> The name you want shown, your school, your board's colours and fonts, the short web address you choose for your board, and a home-screen photo if you add one. If your district is a Gil-Bilt partner, we may match your school email domain to that district to fill in its colours, school list and quick links for you.</p>
      <p><strong>Your board.</strong> Units, lessons, learning goals, agendas, essential questions, links to slides and assignments, video links, calendar links, board settings, and which goals have been checked off. This is the content of your board and it is stored so it is there the next day and on the next device.</p>
      <p><strong>Files.</strong> Documents you create from the board (bell ringers, exit slips, notebooks) are created in <em>your own</em> Google Drive and stay there. Pictures and slide files you upload to the board are stored with Cloudinary, an image hosting service, at a web address that is not listed anywhere but can be opened by anyone who has it.</p>
      <p><strong>Technical information.</strong> Like any website, our servers and hosting provider receive your device's IP address, browser type, and the pages requested. We use the IP address to limit abusive request rates. We keep no analytics beyond what the hosting provider retains in its standard logs.</p>
      <p><strong>On your device.</strong> The site keeps a copy of board settings and content in your browser's local storage so the board loads instantly and works if the connection drops. This stays on your device; clearing site data removes it.</p>

      <h2 style={h2}>Google account access</h2>
      <p>If you connect Google, Gil-Bilt asks for the narrowest permissions that do the job: the ability to create and open files that Gil-Bilt itself created or that you picked in Google's file picker (the "drive.file" permission), and read-only access to list your calendars so you can choose one to show. Gil-Bilt cannot see the rest of your Drive. Files Gil-Bilt creates go into folders in your Drive named for their purpose (for example "Bell Ringers", "Notebooks"), and you own them. Gil-Bilt's use of information received from Google APIs follows the <a style={link} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements. Gil-Bilt never deletes anything from your Drive.</p>

      <h2 style={h2}>Services that run the site</h2>
      <p>We share information only with the services needed to operate Gil-Bilt, each of which handles it under its own privacy policy:</p>
      <ul>
        <li><strong>Clerk</strong>, for sign-in and accounts.</li>
        <li><strong>MongoDB Atlas</strong>, the database where profiles and board content are stored.</li>
        <li><strong>Vercel</strong>, which hosts the website and serves it to your browser.</li>
        <li><strong>Cloudinary</strong>, which stores images and slide files you upload.</li>
        <li><strong>Google</strong>, when you connect Drive, Slides or Calendar, or when a board embeds Google Slides or a Google Calendar.</li>
        <li><strong>Kami</strong>, when you open a document from the board to write on it. Kami opens the file from your own Drive under your own Kami account; Gil-Bilt sends Kami only the file's identifier.</li>
        <li><strong>YouTube</strong>, when a board embeds a video.</li>
      </ul>
      <p>Embedded services such as YouTube, Google Slides and Google Calendar may set their own cookies when their content loads on a board, as they would on any page that embeds them.</p>

      <h2 style={h2}>What we do not do</h2>
      <ul>
        <li>We do not sell, rent or trade your information.</li>
        <li>We do not show advertising.</li>
        <li>We do not use your information, or your students' work on a board, to train any artificial intelligence.</li>
        <li>We do not track you across other websites.</li>
      </ul>

      <h2 style={h2}>Shared boards and short addresses</h2>
      <p>A board is private to its teacher until the teacher turns on Share in Build. A shared board can be viewed by anyone with its link, including its short address, without an account. What is visible is what the teacher put on the board. Turning Share off makes the board private again. Please treat a board the way you would treat a classroom whiteboard: do not put a student's grades, health information or other confidential details on it.</p>

      <h2 style={h2}>Your choices</h2>
      <ul>
        <li><strong>See and change</strong> your profile and board at any time in Build and on your Profile page.</li>
        <li><strong>Download</strong> everything Gil-Bilt holds for your account as one file, from your Profile page.</li>
        <li><strong>Delete</strong> your account and everything stored for it, from your Profile page. Deletion is immediate and permanent. Files in your Google Drive and images already uploaded to Cloudinary are not removed by this; your Drive is yours to tidy, and you can ask us to remove uploaded images by email.</li>
        <li><strong>Disconnect Google</strong> at any time from your Google account's permissions page.</li>
      </ul>

      <h2 style={h2}>Retention and security</h2>
      <p>We keep your information for as long as you have an account. The connection to the site is encrypted, database access is limited to the application, and the application only ever reads or writes a signed-in teacher's own data, or a board its owner has shared. No system is perfectly secure; if we learn of a breach affecting your information we will tell you by the email on your account.</p>

      <h2 style={h2}>Schools and districts</h2>
      <p>Where a school or district arranges for its teachers to use Gil-Bilt, we act on the district's instructions with respect to its teachers' accounts and will sign the district's data agreement where one is required. Because students have no accounts and no student information is collected, Gil-Bilt does not receive education records as defined by FERPA. We are glad to answer a district's questions at {OPERATOR.email}.</p>

      <h2 style={h2}>Changes</h2>
      <p>If this policy changes in a way that matters, we will note the new date at the top and, for significant changes, tell account holders by email.</p>

      <h2 style={h2}>Contact</h2>
      <p>{OPERATOR.name}, operator of {OPERATOR.product}<br />{OPERATOR.email}</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 style={h1}>Terms of Service</h1>
      <div style={muted}>{OPERATOR.product} · Last updated {OPERATOR.updated}</div>

      <p>These are the terms for using {OPERATOR.product} ("Gil-Bilt", "the service") at {OPERATOR.site}, operated by {OPERATOR.name}. By creating an account or using the service you agree to them. They are short on purpose; please read them.</p>

      <h2 style={h2}>The service</h2>
      <p>Gil-Bilt gives a teacher a classroom board: a website that organizes slides, agendas, goals, assignments and links by unit and lesson, for showing on a classroom screen and, optionally, sharing by link. The service is currently free. If that ever changes for any part of it, you will be told clearly before anything is charged, and nothing you have already built will be taken away from you.</p>

      <h2 style={h2}>Your account</h2>
      <p>You must be an adult to hold an account; Gil-Bilt is for teachers and other educators, not students. Keep your sign-in to yourself. You are responsible for what is done with your account, and for keeping the email on it current.</p>

      <h2 style={h2}>Your content</h2>
      <p>What you put on your board is yours. You keep every right to it. You give Gil-Bilt only the permission needed to store it, show it on your board, and show it to people you share the board with. Files Gil-Bilt creates for you in Google Drive belong to you and live in your Drive.</p>
      <p>You are responsible for what you put on a board. Do not post anything you do not have the right to share, anything unlawful, or anything that would be inappropriate on a classroom wall. Do not put a student's confidential information on a board. Use Gil-Bilt in line with your school's or district's policies, and with the terms of the other services you connect, such as Google, Kami and YouTube.</p>

      <h2 style={h2}>Sharing</h2>
      <p>A board is private until you turn on Share. When you do, anyone with the link can view it. You can turn sharing off at any time. Gil-Bilt is not responsible for what a viewer does with a board you chose to share.</p>

      <h2 style={h2}>Acceptable use</h2>
      <p>Do not try to access another person's account or board content that has not been shared with you, interfere with the service, scrape it, or use it to send spam or anything harmful. Do not use the service in a way that breaks the law. We may suspend or close an account that does these things.</p>

      <h2 style={h2}>Other services</h2>
      <p>Gil-Bilt works alongside Google Drive, Google Slides, Google Calendar, Kami, YouTube and others. Those services are governed by their own terms and can change or stop on their own schedule. Gil-Bilt does not control them and is not responsible for them.</p>

      <h2 style={h2}>Availability and changes</h2>
      <p>We work to keep Gil-Bilt available and are honest when something is broken, but it is provided as is, without a promise that it will always be available or free of errors. We may change or add features, and may retire a feature with reasonable notice. Keep your own copies of material that matters to you; the Profile page lets you download everything at any time.</p>

      <h2 style={h2}>Ending things</h2>
      <p>You can delete your account from your Profile page whenever you like, and everything stored for it goes with it. We may close an account for a serious breach of these terms, and will say why.</p>

      <h2 style={h2}>Liability</h2>
      <p>To the extent the law allows, Gil-Bilt and its operator are not liable for indirect or consequential losses arising from use of the service, and total liability for any claim is limited to the amount you paid for the service in the twelve months before the claim, which today is nothing. Nothing in these terms limits liability that cannot be limited by law.</p>

      <h2 style={h2}>Privacy</h2>
      <p>How information is handled is described in the <Link style={link} to="/privacy">Privacy Policy</Link>, which is part of these terms.</p>

      <h2 style={h2}>Law and disputes</h2>
      <p>These terms are governed by the laws of the State of {OPERATOR.state}, United States. If we have a disagreement, please email first; most things can be sorted out in a conversation.</p>

      <h2 style={h2}>Changes to these terms</h2>
      <p>If these terms change in a way that matters, the date at the top will change and account holders will be told by email. Continuing to use the service after that means you accept the new terms.</p>

      <h2 style={h2}>Contact</h2>
      <p>{OPERATOR.name}, operator of {OPERATOR.product}<br />{OPERATOR.email}</p>
    </>
  );
}

export default function LegalPage() {
  const isTerms = useLocation().pathname.replace(/\/+$/, "") === "/terms";
  return (
    <div style={page}>
      <div style={inner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, fontSize: 13 }}>
          <Link to="/" style={{ ...link, fontFamily: "Oswald, sans-serif", letterSpacing: 0.5, textTransform: "uppercase" }}>← Gil-Bilt Classroom</Link>
          <span>
            <Link to="/privacy" style={{ ...link, color: isTerms ? "rgba(255,255,255,0.5)" : "#E87722" }}>Privacy</Link>
            <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 8px" }}>·</span>
            <Link to="/terms" style={{ ...link, color: isTerms ? "#E87722" : "rgba(255,255,255,0.5)" }}>Terms</Link>
          </span>
        </div>
        {isTerms ? <Terms /> : <Privacy />}
      </div>
    </div>
  );
}

// A small "Privacy · Terms" line for the front door, the Profile page and
// the board's footer.
export function LegalLinks({ style, color = "rgba(255,255,255,0.4)" }) {
  const a = { color, textDecoration: "none" };
  return (
    <div style={{ fontFamily: "Lato, sans-serif", fontSize: 11.5, color, ...style }}>
      <Link to="/privacy" style={a}>Privacy</Link>
      <span style={{ margin: "0 6px" }}>·</span>
      <Link to="/terms" style={a}>Terms</Link>
    </div>
  );
}
