/**
 * FIFA Highlights auto-updater
 * --------------------------------
 * For every World Cup match that has finished but doesn't yet have a
 * spoiler-free FIFA "/watch/" highlights link, this script finds the link and
 * writes it into games.json. Run it on a schedule (see the GitHub Action).
 *
 * Strategy:
 *   1) Fast path: try FIFA's content API (no browser). Often blocked/keyed, so
 *      it's best-effort and falls back automatically.
 *   2) Reliable path: Playwright (headless Chrome) opens the match-centre page,
 *      clicks "HIGHLIGHTS", and reads the resulting /watch/ URL.
 *
 * Usage:
 *   node update-highlights.mjs            # only matches whose kickoff already passed
 *   node update-highlights.mjs --all      # check every pending match (first backfill)
 *
 * Env:
 *   DATA_FILE   path to the json (default ./games.json)
 */
import { chromium } from "playwright";
import fs from "node:fs";

const DATA_FILE = process.env.DATA_FILE || "games.json";
const ALL = process.argv.includes("--all");
const GRACE_MS = 90 * 60 * 1000; // assume a game can have highlights ~90 min after kickoff+match

const games = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

function isCandidate(g) {
  if (g.fifa_highlights_status === "available" && g.fifa_watch_url) return false;
  if (!g.fifa_match_centre_url) return false;
  if (ALL) return true;
  // only bother once enough time has passed since kickoff (game likely over + highlight cut)
  if (!g.datetime || g.datetime.length <= 10) return true; // unknown time -> try
  const ko = new Date(g.datetime).getTime();
  return Date.now() > ko + 105 * 60 * 1000 + GRACE_MS; // ~match length + highlight lag
}

const candidates = games.filter(isCandidate);
console.log(`pending candidates: ${candidates.length}`);
if (candidates.length === 0) process.exit(0);

/* -------- 1) optional FIFA API fast path --------
 * If you capture the real request in DevTools (Network tab on a finished
 * match-centre page → "videos" request) and it needs an x-api-key header,
 * put it in the FIFA_API_KEY env var and this will start working server-side
 * (no CORS on a server). Returns a /watch/ url or null.
 */
async function tryApi(g) {
  try {
    const m = g.fifa_match_centre_url.match(/match\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    if (!m) return null;
    const [, competitionId, seasonId, stageId, matchId] = m;
    const url =
      `https://cxm-api.fifa.com/fifaplusweb/api/sections/matchdetails/videos` +
      `?matchId=${matchId}&competitionId=${competitionId}&seasonId=${seasonId}&stageId=${stageId}&locale=en`;
    const headers = { accept: "application/json" };
    if (process.env.FIFA_API_KEY) headers["x-api-key"] = process.env.FIFA_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    // pull the first plausible /watch/ content id from the payload
    const direct = text.match(/\/watch\/([A-Za-z0-9]{18,28})/);
    if (direct) return `https://www.fifa.com/en/watch/${direct[1]}`;
    return null;
  } catch {
    return null;
  }
}

/* -------- 2) Playwright reliable path -------- */
async function dismissCookies(page) {
  for (const sel of ["#onetrust-reject-all-handler", "#onetrust-accept-btn-handler"]) {
    const b = page.locator(sel);
    if (await b.count().catch(() => 0)) {
      await b.first().click({ timeout: 3000 }).catch(() => {});
      break;
    }
  }
}

async function getWatchViaBrowser(page, mcUrl) {
  await page.goto(mcUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await dismissCookies(page);
  await page.waitForTimeout(2500); // let the SPA render

  const btn = page.locator('[class*="HighlightsBtn"], p:has-text("HIGHLIGHTS")').first();
  if ((await btn.count().catch(() => 0)) === 0) return null; // not finished yet

  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 5000 }).catch(() => {});

  // Case A: clicking navigates straight to the watch page
  try {
    await page.waitForURL("**/watch/**", { timeout: 6000 });
    return page.url().split("?")[0];
  } catch {}

  // Case B: a panel of video thumbnails opened — click the real highlights
  // (skip "Gamified Highlights"), then read the /watch/ url.
  const items = page.getByText(/Highlights/i);
  const n = await items.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const it = items.nth(i);
    const txt = (await it.innerText().catch(() => "")) || "";
    if (/gamified/i.test(txt)) continue;
    await it.click({ timeout: 4000 }).catch(() => {});
    try {
      await page.waitForURL("**/watch/**", { timeout: 6000 });
      return page.url().split("?")[0];
    } catch {}
  }
  return null;
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ locale: "en-US" });
const page = await ctx.newPage();

let updated = 0;
for (const g of candidates) {
  let watch = await tryApi(g);
  if (watch) console.log(`API  ✓ ${g.slug} -> ${watch}`);
  if (!watch) {
    watch = await getWatchViaBrowser(page, g.fifa_match_centre_url).catch((e) => {
      console.log(`err  ${g.slug}: ${e.message}`);
      return null;
    });
    if (watch) console.log(`PW   ✓ ${g.slug} -> ${watch}`);
  }
  if (watch) {
    g.fifa_watch_url = watch;
    g.fifa_highlights_status = "available";
    updated++;
  } else {
    console.log(`...  no highlight yet for ${g.slug}`);
  }
}

await browser.close();

if (updated > 0) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2) + "\n");
}
console.log(`done. updated ${updated} match(es).`);
