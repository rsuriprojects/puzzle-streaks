// The games you play come first, in your order, then the rest.
const GAMES = [
  { id: "queens", name: "Queens", color: "var(--g-queens)", kind: "time" },
  { id: "zip", name: "Zip", color: "var(--g-zip)", kind: "time" },
  { id: "pinpoint", name: "Pinpoint", color: "var(--g-pinpoint)", kind: "guesses" },
  { id: "wend", name: "Wend", color: "var(--g-wend)", kind: "time" },
  { id: "patches", name: "Patches", color: "var(--g-patches)", kind: "time" },
  { id: "tango", name: "Tango", color: "var(--g-tango)", kind: "time" },
  { id: "mini-sudoku", name: "Mini Sudoku", color: "var(--g-sudoku)", kind: "time" },
  { id: "crossclimb", name: "Crossclimb", color: "var(--g-crossclimb)", kind: "time" },
];
const gameUrl = (g) => `https://www.linkedin.com/games/${g.id}/`;

// Results come from the extension. The last copy is kept so the page still
// shows something if the extension is off for a moment.
let results = {};
let connected = false;
let lastSync = null;
try { results = JSON.parse(localStorage.getItem("results") || "{}"); } catch {}

const $ = (id) => document.getElementById(id);
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => dayKey(new Date());
const get = (day, gid) => results[`${day}_${gid}`];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : w.endsWith("s") ? "es" : "s"}`;
function result(g, e) {
  if (g.kind === "guesses") return e.guesses ? plural(e.guesses, "guess") : "Solved";
  return e.secs != null ? fmtTime(e.secs) : "Solved";
}

function streak(gid) {
  const d = new Date();
  const playedToday = !!get(dayKey(d), gid);
  if (!playedToday) d.setDate(d.getDate() - 1);
  // LinkedIn's own streak count goes back further than our history. A count
  // read k days ago still holds today as that count plus k.
  let n = 0, theirs = 0, e;
  while ((e = get(dayKey(d), gid))) {
    if (e.streak) theirs = Math.max(theirs, Number(e.streak) + n);
    n++;
    d.setDate(d.getDate() - 1);
  }
  return { n: Math.max(n, theirs), playedToday };
}
function best(g) {
  let b = null;
  for (const e of Object.values(results)) {
    if (e.game !== g.id) continue;
    const v = g.kind === "guesses" ? e.guesses : e.secs;
    if (v != null && (b == null || v < b)) b = v;
  }
  return b;
}

function render() {
  const t = today();
  $("date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const list = $("games");
  list.textContent = "";
  for (const g of GAMES) {
    const e = get(t, g.id);
    const s = streak(g.id);
    const risk = s.n > 0 && !s.playedToday;
    const parts = [];
    if (e) {
      parts.push(`Today <b>${esc(result(g, e))}</b>`);
      if (e.rank) parts.push(`<b>#${esc(e.rank)}</b>${e.of ? ` of ${esc(e.of)}` : ""} among connections`);
      if (e.beat) parts.push(`Smarter than ${esc(e.beat)}`);
    } else {
      parts.push(risk ? "Not played yet. Play today to keep your streak." : "Not played yet");
    }
    const b = best(g);
    if (b != null) parts.push(`Best <b>${g.kind === "guesses" ? plural(b, "guess") : fmtTime(b)}</b>`);

    const li = document.createElement("li");
    li.className = "game";
    li.innerHTML = `
      <div class="row">
        <div class="name">
          <span class="dot" style="background:${g.color}"></span>
          <a href="${gameUrl(g)}" target="_blank" rel="noopener">${g.name} <span class="arrow">↗</span></a>
        </div>
        <div class="streak${risk ? " risk" : ""}">${s.n > 0 ? `<b>${s.n}</b> day streak` : "No streak"}</div>
      </div>
      <div class="meta">${parts.map((p) => `<span>${p}</span>`).join("")}</div>`;
    list.append(li);
  }

  const done = GAMES.filter((g) => get(t, g.id));
  const ranks = done.map((g) => Number(get(t, g.id).rank)).filter(Boolean);
  const top = GAMES.map((g) => ({ g, s: streak(g.id).n })).sort((x, y) => y.s - x.s)[0];
  let txt = `<strong>${done.length} of ${GAMES.length}</strong> played today`;
  if (ranks.length) txt += `, best rank <strong>#${Math.min(...ranks)}</strong>`;
  txt += top.s > 0 ? `. Longest streak is ${top.g.name} at <strong>${top.s} days</strong>.` : ".";
  $("summary").innerHTML = txt;

  const st = $("status");
  if (connected) {
    st.className = "status";
    st.innerHTML = `<span class="live"></span>Logging automatically${lastSync ? `, last result saved ${esc(ago(lastSync))}` : ""}`;
  } else {
    st.className = "status off";
    st.textContent = "Extension not found, so new games won't be logged yet.";
  }
  $("setup").hidden = connected;

  renderHistory();
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ts).toLocaleDateString();
}

function renderHistory() {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const t = today();
  let html = "<thead><tr><th></th>";
  for (const d of days) {
    html += `<th class="${dayKey(d) === t ? "is-today" : ""}" title="${d.toLocaleDateString()}">${d.toLocaleDateString(undefined, { weekday: "narrow" })}<br>${d.getDate()}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const g of GAMES) {
    html += `<tr><th class="g" scope="row">${g.name}</th>`;
    for (const d of days) {
      const e = get(dayKey(d), g.id);
      html += e
        ? `<td><span class="cell on" style="background:${g.color}" title="${esc(`${result(g, e)}${e.rank ? `, #${e.rank}` : ""}`)}"></span></td>`
        : `<td><span class="cell"></span></td>`;
    }
    html += "</tr>";
  }
  $("hist").innerHTML = html + "</tbody>";
}

window.addEventListener("message", (ev) => {
  if (ev.source !== window || ev.data?.source !== "puzzle-streaks-ext") return;
  connected = true;
  results = ev.data.results || {};
  lastSync = Math.max(0, ...Object.values(results).map((e) => e.savedAt || 0)) || null;
  try { localStorage.setItem("results", JSON.stringify(results)); } catch {}
  render();
});
window.postMessage({ source: "puzzle-streaks-page", type: "hello" }, location.origin);

render();
let lastDay = today();
setInterval(() => { if (today() !== lastDay) lastDay = today(); render(); }, 60000);
