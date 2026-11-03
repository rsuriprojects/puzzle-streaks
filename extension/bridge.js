// Runs on the Puzzle Streaks site and hands it the saved results.
async function send() {
  const { results = {}, bonus = null } = await chrome.storage.local.get(["results", "bonus"]);
  window.postMessage({ source: "puzzle-streaks-ext", results, bonus }, location.origin);
}

window.addEventListener("message", (ev) => {
  if (ev.source === window && ev.data?.source === "puzzle-streaks-page") send();
});
chrome.storage.onChanged.addListener((changes) => { if (changes.results || changes.bonus) send(); });
send();
