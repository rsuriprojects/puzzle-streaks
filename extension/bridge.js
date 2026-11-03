// Runs on the Puzzle Streaks site and hands it the saved results.
async function send() {
  const { results = {} } = await chrome.storage.local.get("results");
  window.postMessage({ source: "puzzle-streaks-ext", results }, location.origin);
}

window.addEventListener("message", (ev) => {
  if (ev.source === window && ev.data?.source === "puzzle-streaks-page") send();
});
chrome.storage.onChanged.addListener((changes) => { if (changes.results) send(); });
send();
