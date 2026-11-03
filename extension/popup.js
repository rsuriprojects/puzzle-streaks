const MINE = ["queens", "zip", "pinpoint", "wend", "patches", "tango", "mini-sudoku", "crossclimb"];
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const NAMES = { "queens": "Queens", "zip": "Zip", "pinpoint": "Pinpoint", "wend": "Wend", "patches": "Patches", "tango": "Tango", "mini-sudoku": "Mini Sudoku", "crossclimb": "Crossclimb" };

chrome.storage.local.get("screens", ({ screens = {} }) => {
  const list = document.getElementById("screen-list");
  for (const id of MINE) {
    const s = screens[id];
    if (!s) continue;
    const li = document.createElement("li");
    li.textContent = NAMES[id];
    const btn = document.createElement("button");
    btn.textContent = "Copy";
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(`${NAMES[id]} results screen (extension ${chrome.runtime.getManifest().version}):\n\nRead: ${JSON.stringify(s.parsed || {})}\n\nYour row:\n${s.row || "(not captured)"}\n\nScreen text:\n${s.text}`); btn.textContent = "Copied"; }
      catch { btn.textContent = "Couldn't copy"; }
    };
    li.append(btn);
    list.append(li);
  }
  document.getElementById("screens").hidden = !list.children.length;
});

chrome.storage.local.get(["results", "lastSeen"], ({ results = {}, lastSeen }) => {
  const done = Object.values(results).filter((e) => e.date === today && MINE.includes(e.game)).length;
  document.getElementById("today").innerHTML = `<b>${done} of ${MINE.length}</b> logged today.`;

  const last = document.getElementById("last");
  if (!lastSeen) { last.textContent = "No LinkedIn game seen yet. Open linkedin.com/games and it'll show up here."; return; }
  const when = new Date(lastSeen.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (lastSeen.snippet) {
    // Solved, but the time couldn't be read. Show the screen text so the reader can be fixed.
    last.textContent = `Logged ${lastSeen.game} at ${when}, but couldn't find your time. Screen text:`;
    const pre = document.createElement("pre");
    pre.textContent = lastSeen.snippet;
    last.after(pre);
  } else if (lastSeen.parsed) {
    last.textContent = `Last read ${Array.isArray(lastSeen.parsed) ? lastSeen.parsed.join(", ") + " from the games hub" : lastSeen.game} at ${when}.`;
  } else {
    last.textContent = `Watching ${lastSeen.game} (${when}). Waiting for the results screen.`;
  }
});

// Sync: reads games you played anywhere (like your phone) from LinkedIn.
function syncText(s) {
  if (!s) return "Syncs every 2 hours while Chrome is open.";
  const when = new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (s.state === "running") return "Syncing…";
  if (s.state === "error") return `Sync failed at ${when}. Try again.`;
  return `Synced at ${when}. ${s.played} played today.`;
}
const syncBtn = document.getElementById("sync-now");
const syncStatus = document.getElementById("sync-status");
chrome.storage.local.get("sync", ({ sync }) => {
  syncStatus.textContent = syncText(sync);
  syncBtn.disabled = sync?.state === "running" && Date.now() - sync.at < 90000;
});
chrome.storage.onChanged.addListener((c) => {
  if (!c.sync) return;
  syncStatus.textContent = syncText(c.sync.newValue);
  syncBtn.disabled = c.sync.newValue?.state === "running";
});
syncBtn.addEventListener("click", () => {
  syncBtn.disabled = true;
  syncStatus.textContent = "Syncing…";
  chrome.runtime.sendMessage({ type: "sync-now" });
});
