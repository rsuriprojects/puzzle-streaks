const MINE = ["queens", "zip", "pinpoint", "wend", "patches", "tango", "mini-sudoku", "crossclimb"];
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
