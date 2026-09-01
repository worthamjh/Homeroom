import { useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import WebsterGrovesChemistry from './WebsterGrovesChemistry'

/**
 * The /board route.
 *
 * A signed-out visitor here used to be shown the public Webster Groves
 * demo with no way to sign in — the board page carries no sign-in control
 * at all, unlike the landing and build pages. That stranded anyone whose
 * session had expired, or who opened a bookmark of the board, on someone
 * else's content with no route back to their own except hand-editing the
 * URL. This is the page teachers bookmark and project, so that mattered.
 *
 * Jay's call: "a signed out user should go to the main signin/sign up
 * page. The demo page is not really for other users."
 *
 * The one exception is an EXPLICIT ?teacher= in the URL. That is already
 * this app's "I mean this identity on purpose" signal — useSyncAuthIdentity
 * in boardConfig.js bails out on it for the same reason. It is what
 * BuildPage's iframe passes, and it is how the Webster demo is still
 * reachable at /board?teacher=local-teacher for a pitch, now that the
 * landing page no longer links to it at all.
 */
function App() {
  const { isLoaded, isSignedIn } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const explicitTeacher = searchParams.get('teacher')

  // Only the PUBLIC demo may be viewed without a session. The carve-out
  // used to accept any ?teacher= at all, so a board URL carrying a real
  // account id -- which is exactly what Build links and a teacher's own
  // address bar contain -- rendered for a signed-out visitor, and a tab
  // left open did not react to signing out at all. Jay: "I signed out,
  // it closed the tab with the build page but the other page is still
  // open and useable."
  //
  // The server already refuses the data (every endpoint 401s without a
  // session), so nothing loaded from Mongo. But the board kept showing
  // what was cached locally -- on a classroom machine, that is a
  // teacher's board still projected after they signed out and walked
  // away, which is the one place this must not happen.
  //
  // Build's iframe passes ?teacher=<their own id> and is same-origin, so
  // it shares the Clerk session and satisfies isSignedIn like any other
  // page.
  const publicDemo = explicitTeacher === 'local-teacher'

  useEffect(() => {
    // Waits for isLoaded: Clerk reports signed-out before it has restored
    // the session, so acting early would bounce a signed-in teacher off
    // their own board on every refresh.
    if (!isLoaded || isSignedIn || publicDemo) return
    navigate('/', { replace: true })
  }, [isLoaded, isSignedIn, publicDemo, navigate])

  // The public demo needs no session, so it renders straight away.
  if (publicDemo) return <WebsterGrovesChemistry />

  // Everything below deliberately renders NOTHING until Clerk has
  // answered. The first version of this guard read
  // `if (isLoaded && !isSignedIn) return null`, which left the board
  // rendering during the window where isLoaded is still false -- so a
  // signed-out visitor got a flash of the Webster board and only then the
  // redirect. Showing another teacher's content for even a moment is the
  // exact thing this route was changed to stop, so waiting is right even
  // though it costs a signed-in teacher a brief blank on a cold load.
  //
  // Blank, not a spinner: the body already paints var(--bg), so this is a
  // still page rather than a white flash, and Clerk resolves fast enough
  // that a spinner would itself be the flicker.
  if (!isLoaded) return null
  if (!isSignedIn) return null   // redirect above is pending

  return <WebsterGrovesChemistry />
}

export default App
