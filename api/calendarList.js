import https from "https";

// Proxy for Google Calendar API v3 — routes the browser's token through
// a server-side request to avoid CORS issues inside the BuildPage iframe.
export default async function handler(req, res) {
  const accessToken = req.query?.accessToken || req.body?.accessToken;
  if (!accessToken) {
    res.status(400).json({ error: "accessToken is required" });
    return;
  }

  const path = "/calendar/v3/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,backgroundColor,primary)";
  const options = {
    hostname: "www.googleapis.com",
    path,
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken },
  };

  return new Promise((resolve) => {
    const req2 = https.request(options, (r) => {
      let body = "";
      r.on("data", chunk => { body += chunk; });
      r.on("end", () => {
        if (r.statusCode !== 200) {
          console.error("[api/calendarList] Google error", r.statusCode, body.substring(0, 200));
          res.status(r.statusCode).json({ error: "Google Calendar API error", status: r.statusCode, detail: body.substring(0, 500) });
        } else {
          res.status(200).json(JSON.parse(body));
        }
        resolve();
      });
    });
    req2.on("error", (err) => {
      console.error("[api/calendarList] request error", err);
      res.status(500).json({ error: "Failed to reach Google Calendar API", detail: String(err.message) });
      resolve();
    });
    req2.end();
  });
}
