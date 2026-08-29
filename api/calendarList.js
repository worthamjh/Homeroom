// Proxy for Google Calendar API v3 calendarList — called from the browser
// with an OAuth2 access token, calls Google server-side (no CORS issues),
// and returns the calendar list. Server-side proxying avoids the browser
// CORS preflight that can fail when called from inside an iframe.
export default async function handler(req, res) {
  // Allow both GET (token in query) and POST (token in body)
  const accessToken = req.method === "POST"
    ? (req.body?.accessToken)
    : req.query?.accessToken;

  if (!accessToken) {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  try {
    const url = "https://www.googleapis.com/calendar/v3/calendarList?minAccessRole=reader&fields=items(id,summary,backgroundColor,primary)";
    const googleRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = await googleRes.text();

    if (!googleRes.ok) {
      console.error("[api/calendarList] Google error", googleRes.status, body);
      res.status(googleRes.status).json({ error: `Google Calendar API error (${googleRes.status})`, detail: body });
      return;
    }

    res.status(200).json(JSON.parse(body));
  } catch (err) {
    console.error("[api/calendarList] fetch error", err);
    res.status(500).json({ error: "Failed to reach Google Calendar API", detail: String(err?.message || err) });
  }
}
