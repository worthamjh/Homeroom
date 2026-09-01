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
 * in boardConfig.js bails out on it for the same reason — and it is what
 * the landing page's own "View the Webster Groves demo" link now carries.
 * Without that carve-out the demo link would bounce straight back to the
 * page it was clicked from.
 */
function App() {
  const { isLoaded, isSignedIn } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const explicitTeacher = searchParams.get('teacher')

  useEffect(() => {
    // Waits for isLoaded: Clerk reports signed-out before it has restored
    // the session, so acting early would bounce a signed-in teacher off
    // their own board on every refresh.
    if (!isLoaded || isSignedIn || explicitTeacher) return
    navigate('/', { replace: true })
  }, [isLoaded, isSignedIn, explicitTeacher, navigate])

  // Render nothing while the redirect is pending, so a signed-out visitor
  // never sees a flash of someone else's board on the way out.
  if (isLoaded && !isSignedIn && !explicitTeacher) return null

  return <WebsterGrovesChemistry />
}

export default App
