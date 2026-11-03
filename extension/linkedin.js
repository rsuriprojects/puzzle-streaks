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
    const g = /(?:solved in|in)\s+(\d)\s+guess/i.exec(text) || /(\d)\s*\/\s*5\b/.exec(text);
    if (g) out.guesses = Number(g[1]);
  } else {
    // A time like 1:24 that isn't part of a countdown like 14:22:05.
    const re = /(?<![\d:])(\d{1,2}):([0-5]\d)(?![:\d])/g;
    const anchor = text.search(/solved|your time|you finished|time/i);
    let pick = null, m;
    while ((m = re.exec(text))) {
      if (!pick || (anchor >= 0 && m.index >= anchor && pick.index < anchor)) pick = m;
      if (anchor >= 0 && m.index >= anchor) break;
    }
    if (pick) out.secs = Number(pick[1]) * 60 + Number(pick[2]);
  }

  const streak = /(\d+)[\s-]*day streak/i.exec(text) || /streak[^\d]{0,20}(\d+)/i.exec(text);
  if (streak) out.streak = Number(streak[1]);

  const rankOf = /#?(\d+)\s+(?:of|out of)\s+(\d+)\s+(?:connections|players|people)/i.exec(text);
  if (rankOf) { out.rank = Number(rankOf[1]); out.of = Number(rankOf[2]); }
  else {
    // Leaderboard rows read like "3 / You / 0:45": find "You" and the number above it.
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const i = lines.findIndex((l) => /^(you|\(you\)|.*\(you\))$/i.test(l));
    for (let j = i - 1; i > 0 && j >= Math.max(0, i - 3); j--) {
      const r = /^#?(\d{1,3})(?:st|nd|rd|th)?$/i.exec(lines[j]);
      if (r) { out.rank = Number(r[1]); break; }
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
    if (Object.keys(next).some((k) => next[k] !== prev[k])) {
      results[key] = { ...next, savedAt: Date.now() };
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ results });
  return changed;
}

let announced = false;
async function check() {
  if (!document.body) return;
  const text = document.body.innerText || "";
  const game = gameFromUrl();

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
}

let timer = null;
const schedule = () => { clearTimeout(timer); timer = setTimeout(check, 800); };
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
schedule();
