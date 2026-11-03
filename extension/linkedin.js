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

function parse(game, text) {
  if (!DONE.test(text)) return null;
  const out = { solved: true };

  const num = new RegExp(`${NAMES[game]}\\s*(?:no\\.\\s*)?#\\s*(\\d+)`, "i").exec(text);
  if (num) out.puzzle = Number(num[1]);

  if (game === "pinpoint") {
    const g = /(?:solved in|got it in|in)\s+(\d)\s+(?:guess|clue|tr(?:y|ies))/i.exec(text)
      || /\b(\d)\s+(?:guesses|guess|clues|clue|tries)\b/i.exec(text)
      || /(\d)\s*\/\s*5\b/.exec(text);
    if (g) out.guesses = Number(g[1]);
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
    if (pick) out.secs = Number(pick[1]) * 60 + Number(pick[2]);
  }

  // "106-day win streak!" on the results card.
  const streak = /(\d+)[\s-]*day\s+(?:win\s+)?streak/i.exec(text);
  if (streak) out.streak = Number(streak[1]);

  // "Smarter than 75% of CEOs", "Smarter than 60% of Rishis" and the like.
  const smarter = [...text.matchAll(/smarter than\s+(\d{1,3})%\s+of\s+([^\n!.]{1,40})/gi)]
    .map((m) => `${m[1]}% of ${m[2].trim()}`);
  if (smarter.length) out.smarter = [...new Set(smarter)];

  // "Today's avg: 0:16"
  const avg = /avg:?\s*(\d{1,2}):([0-5]\d)(?![:\d])/i.exec(text);
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
    return;
  }

  const parsed = parse(game, text);
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
    screens[game] = { at: Date.now(), text: snap };
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
