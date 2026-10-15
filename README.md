# Role Radar

A live internship finder built for the TinyFish × TechnoJam bounty. Search is powered by TinyFish Search, pages are read with TinyFish Fetch, and the optional deep scan uses TinyFish Agent to navigate a careers page. Internship results are ranked against your role, location, and keywords, deduplicated by URL, and linked to their original source.

## Run locally

Requirements: Node.js 18 or later and a TinyFish API key.

1. Copy `.env.example` to `.env`, add `TINYFISH_API_KEY`, and set `TINYFISH_API_KEY_SHA256` to the SHA-256 digest of that exact key. The server verifies the fingerprint and performs a live TinyFish Search probe before reporting the API as connected. Keep both values server-side; never place the key in browser code or commit `.env`.
2. Start the app:

   ```powershell
   npm run dev
   ```

3. Open <http://localhost:3000>.
4. Sign in with the seeded demo account: user ID `intern-demo`, password `Internship2026!`.
5. Choose a role, location, and optional comma-separated keywords; select **Find my matches**. The finder only returns internship and co-op roles.
6. Use **Deep scan** on the result set to invoke TinyFish Agent against a live careers page. Agent is optional because it can consume wallet credits; Search and Fetch are free per TinyFish's current docs.

The app-local `.env` key takes precedence over a shell key so the verified key is the same one sent on every API request. If you rotate the key, update both the key and its fingerprint in `.env`.

The demo account is seeded in the local app and displayed on the login screen. Sign-in uses an HTTP-only session cookie; search and Agent routes require that session. This is a single-user demo login, not production account management. The session expires after eight hours and is invalidated when the local server restarts.

## One-hour build sequence

Use the time in this order; keep the optional Agent scan and visual extras out of the critical path until the internship search flow works.

| Time | Deliverable |
|---|---|
| 0–5 min | Create the app shell and seeded demo login, start the server, confirm the API key is available without exposing it in the browser. |
| 5–20 min | Wire TinyFish Search to three distinct query angles, then Fetch up to ten discovered URLs. |
| 20–30 min | Normalize fields, deduplicate URLs, rank role/location/keyword matches, and attach source links. |
| 30–45 min | Build the preference form, result cards, filters, and saved roles. |
| 45–53 min | Add the optional Agent scan and the visible Search/Fetch/Agent explanation. |
| 53–60 min | Run one varied-input search, fix any API/schema issue, capture the demo, and prepare both social posts for submission. |

If the clock is tight, preserve the end-to-end Search → Fetch → ranked result flow first; style and Agent enhancements come after it.

## How the TinyFish APIs are used

- **Search** makes three live queries across job portals and ATS/career pages. Query terms include internship, student program, the user's role, location, and keywords.
- **Fetch** reads up to ten discovered pages and adds page context to each result. The backend merges Search and Fetch output and removes duplicate URLs.
- **Agent** is an optional, user-triggered scan on a result page. Its goal asks it to inspect visible openings and return structured roles; it is explicitly instructed not to submit applications, forms, or log in.
- The browser talks only to this local Node server. TinyFish credentials remain server-side.

## Bounty criteria checklist

- [x] Working demo UI and local run instructions.
- [x] Login page with a seeded, clearly labeled demo user and session-protected search routes.
- [x] User-set role, location, and keywords; internship-only scope is fixed, and preferences are saved in local storage.
- [x] Live multi-source search plus live page reads through TinyFish Search and Fetch; no hardcoded listings.
- [x] Structured opening cards, URL deduplication, match ranking, type filters, and source links.
- [x] Short in-app and README explanation of Search, Fetch, and Agent.
- [ ] Publish a build post on **both LinkedIn and X**, tagging TinyFish. Drafts below are ready to adapt and publish.

## Social post drafts

**LinkedIn**

Built Role Radar at the TinyFish × TechnoJam workshop: a live internship finder that searches company career pages and job portals, reads the pages, deduplicates openings, and ranks them against your role, location, and keywords.

TinyFish Search discovers current sources, Fetch reads the pages, and Agent can take a deeper look at dynamic career sites. Every result links back to its source so you can apply there.

Built with TinyFish. #TinyFish #TechnoJam #BuildInPublic

**X**

Built Role Radar at @TinyFishAI × TechnoJam: live internships matched to your role, location + keywords. Search discovers, Fetch reads, Agent can deep-scan career pages. Deduped results with source links. #TinyFish #BuildInPublic

## Notes

- Search snippets are treated as live source data, not guaranteed employer-verified application status. Open the source link to confirm the current details.
- The scoring is a transparent local heuristic based on the user's inputs; it does not infer qualifications or guarantee fit.
- Agent is called only when the user clicks **Deep scan**. Its output may vary by site, and a completed run with no structured openings is reported as no openings found.
