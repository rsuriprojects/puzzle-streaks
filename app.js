// The games you play come first, in your order, then the rest.
// Colors follow each game's tile on linkedin.com/games.
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
let bonus = null;
let connected = false;
let lastSync = null;
let open = new Set();
try { results = JSON.parse(localStorage.getItem("results") || "{}"); } catch {}
try { bonus = JSON.parse(localStorage.getItem("bonus") || "null"); } catch {}
try { open = new Set(JSON.parse(localStorage.getItem("open") || "[]")); } catch {}

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

const bonusFor = (gid) => (bonus?.date === today() ? bonus.items.filter((b) => b.game === gid) : []);

function details(g, e, s, bonuses) {
  const rows = [];
  if (e) {
    let time = `<b>${esc(result(g, e))}</b>`;
    if (g.kind === "time" && e.secs != null && e.avg) {
      const diff = e.avg - e.secs;
      time += diff > 0 ? ` <span class="sub">${diff}s faster than today's average (${fmtTime(e.avg)})</span>`
        : diff < 0 ? ` <span class="sub">${-diff}s slower than today's average (${fmtTime(e.avg)})</span>`
        : ` <span class="sub">right on today's average</span>`;
    }
    rows.push([g.kind === "guesses" ? "Result" : "Time", time]);
    rows.push(["Connections", e.rank ? `<b>#${esc(e.rank)}</b>${e.of ? ` of ${esc(e.of)}` : ""}` : `<span class="sub">Not on the results screen yet</span>`]);
  } else {
    rows.push(["Today", `Not played yet. <a href="${gameUrl(g)}" target="_blank" rel="noopener">Play ${g.name}</a>`]);
  }
  rows.push(["Streak", s.n > 0 ? `<b>${s.n}</b> ${s.n === 1 ? "day" : "days"}${!s.playedToday ? ` <span class="sub">(play today to keep it)</span>` : ""}` : "None yet"]);
  if (e?.smarter?.length) rows.push(["Smarter than", e.smarter.map((x) => `<div>${esc(x)}</div>`).join("")]);
  if (e?.puzzle) rows.push(["Puzzle", `#${esc(e.puzzle)}`]);
  for (const b of bonuses) rows.push(["Bonus", `<a class="bonus" href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.label)} ↗</a>`]);
  return `<dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
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
    const bonuses = bonusFor(g.id);
    const isOpen = open.has(g.id);

    let todayText = `<span class="sub">Not played</span>`;
    if (e) {
      todayText = `<b>${esc(result(g, e))}</b>`;
      if (e.rank) todayText += `<span class="sep">·</span><b>#${esc(e.rank)}</b>`;
    }

    const li = document.createElement("li");
    li.className = "game" + (isOpen ? " open" : "");
    li.style.setProperty("--game", g.color);
    li.innerHTML = `
      <div class="row">
        <div class="name">
          <span class="dot"></span>
          <a href="${gameUrl(g)}" target="_blank" rel="noopener">${g.name} <span class="arrow">↗</span></a>
          ${bonuses.length ? `<a class="bonus-tag" href="${esc(bonuses[0].url)}" target="_blank" rel="noopener">Bonus puzzle</a>` : ""}
        </div>
        <div class="today">${todayText}</div>
        <div class="streak${risk ? " risk" : ""}">${s.n > 0 ? `<b>${s.n}</b> day${s.n === 1 ? "" : "s"}` : "No streak"}</div>
        <button class="toggle" type="button" aria-expanded="${isOpen}" aria-label="${isOpen ? "Hide" : "Show"} ${g.name} details"><span></span></button>
      </div>
      ${isOpen ? details(g, e, s, bonuses) : ""}`;
    li.querySelector(".row").addEventListener("click", (ev) => {
      if (ev.target.closest("a")) return;
      open.has(g.id) ? open.delete(g.id) : open.add(g.id);
      try { localStorage.setItem("open", JSON.stringify([...open])); } catch {}
      render();
    });
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
  bonus = ev.data.bonus || null;
  lastSync = Math.max(0, ...Object.values(results).map((e) => e.savedAt || 0)) || null;
  try {
    localStorage.setItem("results", JSON.stringify(results));
    localStorage.setItem("bonus", JSON.stringify(bonus));
  } catch {}
  render();
});
window.postMessage({ source: "puzzle-streaks-page", type: "hello" }, location.origin);

render();
let lastDay = today();
setInterval(() => { if (today() !== lastDay) lastDay = today(); render(); }, 60000);
