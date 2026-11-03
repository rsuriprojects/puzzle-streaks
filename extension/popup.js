const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

chrome.storage.local.get(["results", "lastSeen"], ({ results = {}, lastSeen }) => {
  const done = Object.values(results).filter((e) => e.date === today).length;
  document.getElementById("today").innerHTML = `<b>${done} of 6</b> logged today.`;

  const last = document.getElementById("last");
  if (!lastSeen) { last.textContent = "No LinkedIn game seen yet. Play one and it'll show up here."; return; }
  const when = new Date(lastSeen.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (lastSeen.parsed) {
    last.textContent = `Last read ${lastSeen.game} at ${when}.`;
  } else if (lastSeen.snippet) {
    // Results screen was there but couldn't be read. Show it so the parser can be fixed.
    last.textContent = `Saw a finished ${lastSeen.game} at ${when} but couldn't read the result. Screen text:`;
    const pre = document.createElement("pre");
    pre.textContent = lastSeen.snippet;
    last.after(pre);
  } else {
    last.textContent = `Watching ${lastSeen.game} (${when}). Waiting for the results screen.`;
  }
});
