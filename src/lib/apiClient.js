// One place that talks to /api, so every endpoint gets the session token
// without sixteen fetch call sites each remembering to attach it.
//
// The token getter is REGISTERED rather than imported, because Clerk's is
// only reachable from inside <ClerkProvider> (useAuth) while these API
// helpers are plain modules called from anywhere. AuthIdentitySync in
// main.jsx registers it once, above the routes; until then, and for a
// signed-out visitor, calls simply go out unauthenticated — which is
// exactly what the public demo needs.
let tokenGetter = null;

export function registerAuthTokenGetter(getter) {
  tokenGetter = getter;
}

async function authHeader() {
  if (!tokenGetter) return null;
  try {
    const token = await tokenGetter();
    return token ? `Bearer ${token}` : null;
  } catch {
    // A failed token fetch must not take the request down with it: the
    // server will answer 401 and the caller's existing catch handles it,
    // which is the same path a signed-out visitor takes.
    return null;
  }
}

/**
 * fetch() for this app's own API. Identical signature; it only adds the
 * Authorization header. Never use it for third-party URLs — that would
 * hand a teacher's session token to someone else's server.
 */
export async function apiFetch(path, options = {}) {
  const auth = await authHeader();
  if (!auth) return fetch(path, options);
  return fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: auth },
  });
}
