// Runs on LinkedIn's game pages. Watches for the results screen and saves
// what it shows: your time (or guesses), your rank among connections and
// LinkedIn's streak count. On the games hub it marks every game you've
// solved today. Everything stays in chrome.storage.local.

const NAMES = {
  "queens": "Queens", "zip": "Zip", "pinpoint": "Pinpoint", "wend": "Wend", "patches": "Patches",
  "tango": "Tango", "mini-sudoku": "Mini Sudoku", "crossclimb": "Crossclimb",
};
const GAMES = Object.keys(NAMES);

function gameFromUrl() {
  const urls = [location.href];
  try { urls.push(window.top.location.href); } catch {}
  urls.push(document.referrer);
  for (const u of urls) {
    const m = /\/games\/(?:view\/)?([a-z-]+)/.exec(u || "");
    if (m && GAMES.includes(m[1])) return m[1];
  }
  return null;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DONE = /you solved|solved in|you won|you did it|puzzle solved|crushing it|come back tomorrow|next puzzle in|see you tomorrow/i;

// Your row on the leaderboard: "[medal or 4] [avatar] You  🔥 101-day streak!  0:33".
// Ranks 1-3 are medal pictures with no text, and ties share a rank
// (1, 1, 2, 3, 4...), so when your row has no number the rank is worked
// out from the rows around it.
const MEDAL = /\b(?:rank|place|position|medal)[\s_-]*(?:#|no\.?\s*)?([1-3])\b|\b([1-3])(?:st|nd|rd)\s+place\b|\b(gold)\b|\b(silver)\b|\b(bronze)\b/i;
const TIME = /(?<![\d:])(\d{1,2}):([0-5]\d)(?![:\d])/;
const timeOf = (el) => { const m = TIME.exec(el.innerText || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const numOf = (el) => { const m = /^\s*#?(\d{1,3})\s*\n/.exec(el.innerText || ""); return m ? Number(m[1]) : null; };
// A row's score: its time, or for Pinpoint the number of guesses on its last line.
const scoreOf = (el) => {
  const t = timeOf(el);
  if (t != null) return t;
  const lines = (el.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const m = lines.length > 1 && /^(\d{1,2})$/.exec(lines[lines.length - 1]);
  return m ? Number(m[1]) : null;
};

// Your row's markup (minus image URLs), kept so the popup can copy it when a
// rank isn't read right.
let rowHtml = "";

function rowFor(hit) {
  // Climb to the box that sits next to other rows like it (same tag and
  // class, several lines of text each). Rows aren't list items here, and
  // Pinpoint rows have no time to go by.
  let row = hit;
  for (let k = 0; k < 10 && row.parentElement; k++) {
    row = row.parentElement;
    if (row.matches("li, [role='listitem'], tr")) return row;
    const sibs = [...(row.parentElement?.children || [])].filter((el) => el !== row
      && el.tagName === row.tagName && el.className === row.className);
    if (scoreOf(row) != null && sibs.some((el) => (el.innerText || "").trim().includes("\n") && scoreOf(el) != null)) return row;
  }
  // No sibling rows (you're the only player): climb to the box holding your score.
  row = hit;
  for (let k = 0; k < 8 && row.parentElement && scoreOf(row) == null; k++) row = row.parentElement;
  return row;
}

function rankOf(row, played) {
  const own = numOf(row);
  if (own) return own;

  for (const el of [row, ...row.querySelectorAll("*")]) {
    // Labels and image file names only: class names are full of words like "first".
    const file = (el.getAttribute("src") || "").split(/[?#]/)[0].split("/").pop();
    const bits = [el.getAttribute("alt"), el.getAttribute("aria-label"), el.getAttribute("title"),
      file.replace(/[_-]/g, " "), el.tagName.toLowerCase() === "title" ? el.textContent : null].filter(Boolean).join(" | ");
    const m = MEDAL.exec(bits);
    if (m) return Number(m[1] || m[2]) || (m[3] ? 1 : m[4] ? 2 : 3);
  }

  const mine = scoreOf(row);
  if (mine == null || !row.parentElement) return null;
  const rows = [...row.parentElement.children].filter((el) => scoreOf(el) != null);
  const i = rows.indexOf(row);

  // Everyone is listed: your rank is 1 + the number of different better scores.
  if (played && rows.length === played + 1) {
    return new Set(rows.map(scoreOf).filter((t) => t < mine)).size + 1;
  }
  // The row under you is numbered: "4 Maahi 0:11" under your 0:10 makes you 3.
  const next = rows[i + 1];
  if (next && numOf(next)) return scoreOf(next) > mine ? numOf(next) - 1 : numOf(next);
  // The row above you is numbered.
  const prev = rows[i - 1];
  if (prev && numOf(prev)) return scoreOf(prev) < mine ? numOf(prev) + 1 : numOf(prev);
  return null;
}

function yourRow() {
  // LinkedIn wraps text in empty comment and whitespace nodes, so walk the
  // text nodes themselves and look for ones that are exactly "You". The
  // full leaderboard and the short one under the results can both be open.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() === "You" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  const played = Number(/(\d+)\s+connections?\s+played today/i.exec(document.body.innerText || "")?.[1]) || 0;
  let row = null, rank = null, n;
  while ((n = walker.nextNode())) {
    const r = rowFor(n.parentElement);
    const k = rankOf(r, played);
    if (!row || (k && !rank)) { row = r; rank = k; }
    if (rank) break;
  }
  if (!row) { rowHtml = "(no row with the text \"You\" found)"; return {}; }
  rowHtml = row.outerHTML.replace(/\s(?:src|srcset|href|style|data-[\w-]+)="[^"]*"/g, "").slice(0, 3000);

  const out = {};
  if (rank) out.rank = rank;
  const text = row.innerText || "";
  const secs = timeOf(row);
  if (secs != null) out.secs = secs;
  const score = scoreOf(row);
  if (score != null && secs == null) out.guesses = score;

  // Badges under your name: "🔥 101-day streak!", "No hints & no redraws!"...
  // LinkedIn repeats each one with a template copy after it, so keep the
  // part before the first "!".
  const badges = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("!")[0].replace(/\{:[^}]*\}/g, "").replace(/[^\p{L}\p{N}\s:'’&%-]/gu, "").trim();
    if (!line || /^you$/i.test(line) || /^#?\d{1,3}$/.test(line) || TIME.test(line) && line.length < 6) continue;
    const st = /(\d+)[\s-]*day\s+(?:win\s+)?streak/i.exec(line);
    if (st) { out.streak = Number(st[1]); continue; }
    if (line.length <= 40) badges.push(line);
  }
  if (badges.length) out.badges = [...new Set(badges)];
  return out;
}

function parse(game, text, you = {}) {
  // The leaderboard can sit in a different part of the page than the
  // "You're crushing it!" card, so your row alone is enough to go on.
  if (!DONE.test(text) && !you.rank) return null;
  const out = { solved: true };

  const num = new RegExp(`${NAMES[game]}\\s*(?:no\\.\\s*)?#\\s*(\\d+)`, "i").exec(text);
  if (num) out.puzzle = Number(num[1]);

  if (game === "pinpoint") {
    // "Solved in 1" on the results card, else the number on your leaderboard row.
    const g = /solved in\s+(\d)\b/i.exec(text)
      || /(?:got it in|in)\s+(\d)\s+(?:guess|clue|tr(?:y|ies))/i.exec(text)
      || /\b(\d)\s+(?:guesses|guess|clues|clue|tries)\b/i.exec(text);
    if (g) out.guesses = Number(g[1]);
    else if (you.guesses != null) out.guesses = you.guesses;
    // "Today's avg: 2"
    const ga = /avg:?\s*(\d+(?:\.\d+)?)(?![:\d])/i.exec(text);
    if (ga) out.avg = Number(ga[1]);
  } else {
    // A time like 1:24 that isn't part of a countdown like 14:22:05,
    // and isn't the "Today's avg: 0:16" line.
    const re = /(?<![\d:])(\d{1,2}):([0-5]\d)(?![:\d])/g;
    const anchor = text.search(/crushing it|solved|your time|you finished/i);
    let pick = null, m;
    while ((m = re.exec(text))) {
      if (/avg:?\s*$|average:?\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
      if (!pick || (anchor >= 0 && m.index >= anchor && pick.index < anchor)) pick = m;
      if (anchor >= 0 && m.index >= anchor) break;
    }
    if (you.secs != null) out.secs = you.secs;
    else if (pick && DONE.test(text)) out.secs = Number(pick[1]) * 60 + Number(pick[2]);
  }

  // "106-day win streak!" on the results card, else the badge on your
  // leaderboard row. Other rows show friends' streaks, so never take the
  // first "day streak" on the page.
  const streak = /(\d+)[\s-]*day\s+win\s+streak/i.exec(text);
  if (streak) out.streak = Number(streak[1]);
  else if (you.streak) out.streak = you.streak;
  else if (/new streak/i.test(text)) out.streak = 1; // "New streak / Game on!"

  // "Your best score yet!" on the time card.
  if (/your best score yet/i.test(text)) out.newBest = true;
  if (you.badges) out.badges = you.badges;

  // "Smarter than 75% of CEOs", "Smarter than 50% of Rishis". The page also
  // holds a template copy ("{:player_rank_percentage}% of {:first_name}") and
  // a badge version ending in "today", so cut at "{" and drop "today".
  const smarter = [...text.matchAll(/smarter than\s+(\d{1,3})%\s+of\s+([^\n!.{]{1,40})/gi)]
    .map((m) => `${m[1]}% of ${m[2].replace(/\s+today\s*$/i, "").trim()}`);
  if (smarter.length) out.smarter = [...new Set(smarter)];

  // "Top 25%" / "of all players", "Top 75%" / "of my connections".
  const top = [...text.matchAll(/top\s+(\d{1,3})%\s*\n?\s*of\s+(all players|my connections)/gi)]
    .map((m) => `${m[1]}% of ${m[2].toLowerCase()}`);
  if (top.length) out.top = [...new Set(top)];

  // The stats panel: "101 Plays  100 Win %  0:10 Best score  101 Max streak".
  const stat = (label) => new RegExp(`([\\d:]+)\\s*(?:%\\s*)?\\n?\\s*${label}`, "i").exec(text)?.[1];
  const plays = stat("Plays"), win = stat("Win\\s*%"), bestScore = stat("Best score"), maxStreak = stat("Max streak");
  if (plays) out.plays = Number(plays);
  if (win) out.winPct = Number(win);
  if (bestScore) out.best = bestScore.includes(":") ? bestScore.split(":").reduce((m, s) => m * 60 + Number(s), 0) : Number(bestScore);
  if (maxStreak) out.maxStreak = Number(maxStreak);
  const freezes = /(\d+)\s+streak freezes?\s+ready/i.exec(text);
  if (freezes) out.freezes = Number(freezes[1]);

  // "3 connections played today"
  const played = /(\d+)\s+connections?\s+played today/i.exec(text);
  if (played) out.played = Number(played[1]);

  // "Today's avg: 0:16"
  const avg = game !== "pinpoint" && /avg:?\s*(\d{1,2}):([0-5]\d)(?![:\d])/i.exec(text);
  if (avg) out.avg = Number(avg[1]) * 60 + Number(avg[2]);

  const rankOf = /#?(\d+)\s+(?:of|out of)\s+(\d+)\s+(?:connections|players|people)/i.exec(text);
  const rankSaid = /(?:you(?:'|’)?re|you are|ranked|rank)\s*#\s*(\d+)/i.exec(text);
  if (rankOf) { out.rank = Number(rankOf[1]); out.of = Number(rankOf[2]); }
  else if (rankSaid) out.rank = Number(rankSaid[1]);
  else {
    // Leaderboard rows read like "3 / You / 0:45": find your row and the
    // number just above it (or at the start of the same line).
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const isYou = (l) => /^(?:#?\d{1,3}[.)]?\s+)?you(?![’'a-z])/i.test(l) || /\(you\)/i.test(l);
    const i = lines.findIndex(isYou);
    if (i >= 0) {
      const same = /^#?(\d{1,3})(?:st|nd|rd|th)?[\s.)]+/.exec(lines[i]);
      if (same) out.rank = Number(same[1]);
      for (let j = i - 1; !out.rank && j >= Math.max(0, i - 5); j--) {
        const r = /^#?(\d{1,3})(?:st|nd|rd|th)?\.?$/i.exec(lines[j]);
        if (r) out.rank = Number(r[1]);
      }
    }
  }
  // Your own leaderboard row is the most reliable source (and the only one for medals).
  if (you.rank) out.rank = you.rank;
  return out;
}

// The hub lists each game as "Queens #917" with a status line under it,
// such as "You're crushing it!" once you've solved today's puzzle.
function parseHub(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const byName = Object.fromEntries(GAMES.map((id) => [NAMES[id].toLowerCase(), id]));
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(.+?)\s*#\s*(\d+)$/.exec(lines[i]);
    const id = m && byName[m[1].toLowerCase()];
    if (!id) continue;
    const status = lines.slice(i + 1, i + 3).join(" ");
    if (/crushing it|solved|completed|you did it|nice work|great job|well done/i.test(status)) {
      found.push({ game: id, data: { solved: true, puzzle: Number(m[2]) } });
    }
  }
  return found;
}

async function save(items) {
  const date = dayKey(new Date());
  const { results = {} } = await chrome.storage.local.get("results");
  let changed = false;
  for (const { game, data } of items) {
    const key = `${date}_${game}`;
    const prev = results[key] || {};
    const next = { ...prev, ...data, game, date };
    if (Object.keys(next).some((k) => JSON.stringify(next[k]) !== JSON.stringify(prev[k]))) {
      results[key] = { ...next, savedAt: Date.now() };
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ results });
  return changed;
}

// Bonus puzzles (like a bonus Zip) show up as an extra link or tile.
// Keep today's list so the site can point to them.
function findBonus(text, game) {
  const items = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const label = (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!/bonus/i.test(label) || !/linkedin\.com\/games/.test(a.href)) continue;
    const named = GAMES.find((id) => label.toLowerCase().includes(NAMES[id].toLowerCase()) || a.href.includes(`/games/${id}`));
    items.push({ game: named || game || "zip", label: label.slice(0, 60), url: a.href });
  }
  if (!items.length && game && /bonus (?:puzzle|level|round|game)/i.test(text)) {
    items.push({ game, label: "Bonus puzzle", url: location.href });
  }
  return items;
}

async function saveBonus(items) {
  const date = dayKey(new Date());
  const { bonus } = await chrome.storage.local.get("bonus");
  const current = bonus?.date === date ? bonus.items : [];
  const merged = [...current];
  for (const it of items) if (!merged.some((m) => m.url === it.url)) merged.push(it);
  if (merged.length !== current.length || bonus?.date !== date) {
    await chrome.storage.local.set({ bonus: { date, items: merged } });
  }
}

let announced = false;
let hubAnnounced = false;
let lastScreen = "";
async function check() {
  if (!document.body) return;
  const text = document.body.innerText || "";
  const game = gameFromUrl();

  const bonus = findBonus(text, game);
  if (bonus.length) await saveBonus(bonus);

  if (!game) {
    const hub = parseHub(text);
    if (hub.length && await save(hub)) {
      await chrome.storage.local.set({ lastSeen: { game: "games hub", at: Date.now(), parsed: hub.map((h) => h.game) } });
    }
    // Tell the background sync the games list has loaded, so it knows which
    // games are solved today and only opens those.
    if (!hubAnnounced && /\b(?:Queens|Zip|Tango|Pinpoint)\s*#\s*\d+/.test(text)) {
      hubAnnounced = true;
      await chrome.storage.local.set({ hubSeen: Date.now() });
    }
    return;
  }

  const parsed = parse(game, text, yourRow());
  if (!parsed) {
    // Only record "watching" once per page, not on every timer tick.
    if (!announced) { announced = true; await chrome.storage.local.set({ lastSeen: { game, at: Date.now() } }); }
    return;
  }
  const seen = { game, at: Date.now(), parsed };
  // Solved but no time or guesses found: keep the screen text so the reader can be fixed.
  if (parsed.secs == null && parsed.guesses == null) seen.snippet = text.slice(0, 800);
  if (await save([{ game, data: parsed }])) await chrome.storage.local.set({ lastSeen: seen });

  // Keep the latest results-screen text per game (only in this browser) so
  // the popup can copy it when something isn't read right.
  const snap = text.slice(0, 4000);
  const sig = snap.replace(/\d+:\d{2}:\d{2}/g, ""); // ignore the ticking countdown
  if (sig !== lastScreen) {
    lastScreen = sig;
    const { screens = {} } = await chrome.storage.local.get("screens");
    screens[game] = { at: Date.now(), text: snap, row: rowHtml, parsed };
    await chrome.storage.local.set({ screens });
  }
}

// When the extension is reloaded or updated, scripts already running in open
// tabs lose access to Chrome and every call throws "Extension context
// invalidated". Stop watching then; the reloaded tab gets a fresh script.
const alive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };

let timer = null;
const observer = new MutationObserver(() => schedule());
function schedule() {
  if (!alive()) { observer.disconnect(); clearTimeout(timer); return; }
  clearTimeout(timer);
  timer = setTimeout(() => check().catch(() => { if (!alive()) observer.disconnect(); }), 800);
}
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
schedule();
