# FIFA Highlights Bot 🤖⚽

Automatically fills in **spoiler-free FIFA `/watch/` highlight links** for World
Cup matches as they finish, and commits the updated `games.json` back to your
repo — which your site reads. Runs free on GitHub Actions every 30 minutes.

## How it works

`update-highlights.mjs` looks at `games.json`, finds matches that are over but
have no highlight link yet, and resolves each one:

1. **API fast path** — tries FIFA's content API directly (no browser). Optional;
   only works if you provide an API key (see below).
2. **Browser path (always works)** — uses Playwright (headless Chrome) to open
   the match-centre page, click **HIGHLIGHTS**, and read the resulting
   `/watch/<id>` URL.

When found, it sets `fifa_watch_url` and flips `fifa_highlights_status` to
`available`, then the GitHub Action commits the file.

> Note: FIFA publishes the highlight reel ~30–90 min **after** full-time, so the
> bot polls; it won't have the link the instant the whistle blows.

## Setup (GitHub Actions — recommended)

1. Create a new GitHub repo and add these files (keep the folder structure,
   including `.github/workflows/update-highlights.yml`).
2. Push to GitHub. That's it — the schedule starts automatically.
3. First run / backfill: go to the repo's **Actions** tab → "Update FIFA
   highlight links" → **Run workflow** → tick **backfill** → Run. This checks
   every pending match immediately instead of waiting for kickoff times.

The workflow already has `permissions: contents: write`, so it can commit
`games.json` using the built-in token — no secrets required for the browser path.

### Optional: enable the faster API path

On a finished match's FIFA match-centre page, open DevTools → Network → find the
`sections/matchdetails/videos` request. If it sends an `x-api-key` header, copy
that value into a repo secret named **`FIFA_API_KEY`** (Settings → Secrets and
variables → Actions). The bot will then resolve links via the API (fast, no
browser) and only fall back to Playwright when needed.

## Run locally (to test)

```bash
npm install
npx playwright install chromium
node update-highlights.mjs --all      # check everything once
```

## Connecting to your site

- **JSON in repo (this setup):** your Lovable site reads `games.json` from the
  repo. When the bot commits an update, the site redeploys with fresh links.
- **Switch to a database instead (e.g. Supabase):** replace the `fs.writeFileSync`
  block at the bottom of `update-highlights.mjs` with an upsert to your table,
  and have your frontend query that table. Use this if your site is serverless
  and can't read a repo file.

## Tuning

- **Frequency:** edit the `cron:` line in the workflow (`*/30 * * * *` = every 30
  min). During match days you might use `*/15`.
- **Field meanings** in `games.json`: `url` = Kan match page (needs the
  extension to hide spoilers); `fifa_match_centre_url` = FIFA page that SHOWS the
  score (internal use only); `fifa_watch_url` = the spoiler-free highlight link
  to send users to.

## Heads up (legal)

You're scraping FIFA and reusing their links, and the site is monetized. That's
a trademark/ToS gray area; consider keeping it clearly unofficial and avoid
re-hosting any FIFA video yourself (only link out to FIFA's own `/watch/` pages).
