// Background sync. LinkedIn keeps your results on your account, so games you
// play on your phone show up on the results pages here too. A few times a
// day this opens linkedin.com/games in a minimized window to see which games
// you've solved, then opens just those games' pages so linkedin.js can read
// your time, rank and streak, and closes the window again.
//
// It never opens a game you haven't solved yet, so it can't start a puzzle
// or its timer.

const GAMES = ["queens", "zip", "pinpoint", "wend", "patches", "tango", "mini-sudoku", "crossclimb"];
const HUB = "https://www.linkedin.com/games/";
const EVERY_MINUTES = 120;

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return true;
    await wait(1000);
  }
  return false;
}

async function today() {
  const { results = {} } = await chrome.storage.local.get("results");
  const d = dayKey(new Date());
  const out = {};
  for (const g of GAMES) if (results[`${d}_${g}`]) out[g] = results[`${d}_${g}`];
  return out;
}

const hasScore = (g, e) => !!e && (g === "pinpoint" ? e.guesses != null : e.secs != null);
const isComplete = (g, e) => hasScore(g, e) && e.rank != null;

function schedule() {
  chrome.alarms.create("sync", { delayInMinutes: 1, periodInMinutes: EVERY_MINUTES });
}
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "sync") sync(); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "sync-now") { sync().then(reply); return true; }
});

let running = false;
async function sync() {
  if (running) return { ok: false, message: "Already syncing" };
  running = true;
  const started = Date.now();
  let win = null;
  try {
    await chrome.storage.local.set({ sync: { state: "running", at: started } });

    // 1. The games list marks every game you've solved today, on any device.
    win = await chrome.windows.create({ url: HUB, state: "minimized", focused: false });
    await waitFor(async () => ((await chrome.storage.local.get("hubSeen")).hubSeen || 0) > started, 20000);
    await wait(1500);

    // 2. Open the solved games still missing a score or rank. A game whose
    // rank can't be read (a short leaderboard) is only retried once a day.
    const d = dayKey(new Date());
    const { syncTried = {} } = await chrome.storage.local.get("syncTried");
    const tried = syncTried.date === d ? syncTried.games : [];
    const t = await today();
    const todo = GAMES.filter((g) => t[g] && (!hasScore(g, t[g]) || (!isComplete(g, t[g]) && !tried.includes(g))));
    for (const g of todo) {
      await chrome.tabs.create({ windowId: win.id, url: `https://www.linkedin.com/games/${g}/`, active: false });
    }
    if (todo.length) {
      await waitFor(async () => { const now = await today(); return todo.every((g) => isComplete(g, now[g])); }, 30000);
      await chrome.storage.local.set({ syncTried: { date: d, games: [...new Set([...tried, ...todo])] } });
    }

    const played = Object.keys(await today()).length;
    const status = { state: "done", at: Date.now(), played, opened: todo.length };
    await chrome.storage.local.set({ sync: status });
    return { ok: true, ...status };
  } catch (e) {
    const status = { state: "error", at: Date.now(), message: String(e?.message || e) };
    await chrome.storage.local.set({ sync: status });
    return { ok: false, ...status };
  } finally {
    if (win) await chrome.windows.remove(win.id).catch(() => {});
    running = false;
  }
}
