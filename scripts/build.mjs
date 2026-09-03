import { mkdir, writeFile } from "node:fs/promises";
import { renderPerformancePage } from "./performance-template.mjs";

const API = "https://api.boatlabs.net/v1/timingsystems";
const CONCURRENCY = 3;
const TIMEOUT_MS = 15_000;
const PERFORMANCE_POINTS = [100, 75, 50, 38, 27, 22, 19, 17, 16, 15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 2];

async function requestJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "BoatLabs-WR-Archive/1.0 (daily GitHub Pages snapshot)",
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

const catalog = await requestJson(`${API}/getTracks`);
const tracks = (Array.isArray(catalog) ? catalog : catalog.tracks || [])
  .filter((track) => track && track.open !== false && track.command_name);

let cursor = 0;
const winners = [];
const performances = [];
const failures = [];

async function worker() {
  while (true) {
    const track = tracks[cursor++];
    if (!track) return;
    try {
      const detail = await requestJson(`${API}/getTrack/${encodeURIComponent(track.command_name)}`);
      const topList = Array.isArray(detail?.top_list) ? detail.top_list.slice(0, 20) : [];
      const first = topList[0];
      if (!first?.name || first.time == null) continue;
      const trackData = {
        trackId: track.id ?? detail.id ?? track.command_name,
        track: track.name || detail.name || track.command_name,
        commandName: track.command_name,
        difficulty: track.difficulty || detail.difficulty || "Unknown",
      };
      winners.push({
        ...trackData,
        player: first.name,
        time: formatTime(first.time),
        verified: Boolean(first.verified),
      });
      topList.forEach((entry, index) => {
        if (!entry?.name || entry.time == null) return;
        performances.push({
          ...trackData,
          player: entry.name,
          position: index + 1,
          points: PERFORMANCE_POINTS[index],
          time: formatTime(entry.time),
          verified: Boolean(entry.verified),
        });
      });
    } catch (error) {
      failures.push({ track: track.command_name, error: error.message });
    }
  }
}

function formatTime(milliseconds) {
  const total = Number(milliseconds);
  if (!Number.isFinite(total)) return String(milliseconds);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = Math.floor(total % 1_000);
  return minutes
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
    : `${seconds}.${String(millis).padStart(3, "0")}`;
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
winners.sort((a, b) => a.player.localeCompare(b.player) || a.track.localeCompare(b.track));
performances.sort((a, b) => a.player.localeCompare(b.player) || a.track.localeCompare(b.track) || a.position - b.position);

const fetchedAt = new Date().toISOString();
const snapshot = {
  fetchedAt,
  tracksScanned: tracks.length,
  records: winners.length,
  failed: failures.length,
  winners,
};
const performanceSnapshot = {
  fetchedAt,
  tracksScanned: tracks.length,
  placements: performances.length,
  failed: failures.length,
  performances,
};

const data = JSON.stringify(snapshot).replace(/</g, "\\u003c");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Unofficial daily snapshot of BoatLabs world records.">
  <title>BoatLabs WR Leaderboard</title>
  <style>
    :root{color-scheme:dark;--bg:#080b10;--panel:#10151d;--line:#242c37;--text:#f3f5f7;--muted:#9ca8b5;--gold:#ffc85c;--green:#54dc96;--cyan:#4ed9e4;--coral:#ff8e86;--purple:#c799ff}*{box-sizing:border-box}html,body{height:100%;overflow:hidden}body{margin:0;background:radial-gradient(900px 500px at 90% -20%,#1a2636 0%,transparent 66%),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(1180px,calc(100% - 32px));height:100dvh;margin:auto;padding:26px 0 16px;display:flex;flex-direction:column;min-height:0}.top{flex:none;display:flex;align-items:center;gap:13px;margin-bottom:16px}.mark{width:38px;height:38px;display:grid;place-items:center;background:var(--gold);color:#15100a;font-weight:900;letter-spacing:-1px;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}.eyebrow{font-size:10px;letter-spacing:.14em;color:var(--muted);font-weight:800}.top h1{font-size:16px;letter-spacing:.03em;margin:2px 0 0}.site-nav{margin-left:auto;display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:10px;background:#0c1118}.site-nav a{padding:7px 10px;border-radius:7px;color:var(--muted);font-size:12px;font-weight:750;text-decoration:none;white-space:nowrap}.site-nav a:hover{color:var(--text);background:#151c26}.site-nav a.active{background:var(--gold);color:#15100a;box-shadow:0 1px 8px rgba(255,200,92,.22)}.meta{text-align:right;color:var(--muted);font-size:12px}.meta strong{display:block;color:var(--text);font-weight:650}.tools{flex:none;display:flex;gap:10px;align-items:center;margin:0 0 14px}.search{flex:1;min-width:0;border:1px solid var(--line);background:#0c1118;border-radius:10px;color:var(--text);padding:12px 14px;font:inherit;outline:none}.search:focus{border-color:#677586}.toggle{white-space:nowrap;display:flex;gap:8px;align-items:center;color:var(--muted);font-size:13px}.toggle input{accent-color:var(--gold);width:16px;height:16px}.layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(310px,.8fr);gap:16px}.panel{min-height:0;display:flex;flex-direction:column;border:1px solid var(--line);background:linear-gradient(160deg,#111720,#0d1219);border-radius:14px;overflow:hidden}.list-head{flex:none;padding:14px 16px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:52px 1fr 55px 74px;gap:8px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.12em}#rows,.cards{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-color:#3a4758 transparent}#rows{flex:1}.row{width:100%;border:0;border-bottom:1px solid #202833;background:transparent;color:inherit;padding:10px 16px;display:grid;grid-template-columns:52px 1fr 55px 74px;gap:8px;align-items:center;text-align:left;font:inherit;cursor:pointer}.row.podium-gold{background:linear-gradient(105deg,rgba(255,200,92,.30),rgba(112,77,20,.31) 54%,rgba(255,226,143,.12));border-bottom-color:#856321}.row.podium-silver{background:linear-gradient(105deg,rgba(216,226,235,.27),rgba(85,102,118,.31) 54%,rgba(231,239,246,.10));border-bottom-color:#697887}.row.podium-bronze{background:linear-gradient(105deg,rgba(218,143,91,.29),rgba(111,60,31,.31) 54%,rgba(244,177,124,.10));border-bottom-color:#814c2b}.row:hover,.row:focus-visible{background:#19212c;outline:0}.row.podium-gold:hover,.row.podium-gold:focus-visible{background:linear-gradient(105deg,rgba(255,210,106,.42),rgba(132,91,24,.43) 54%,rgba(255,233,165,.20))}.row.podium-silver:hover,.row.podium-silver:focus-visible{background:linear-gradient(105deg,rgba(226,234,242,.39),rgba(102,120,137,.42) 54%,rgba(239,245,250,.18))}.row.podium-bronze:hover,.row.podium-bronze:focus-visible{background:linear-gradient(105deg,rgba(230,156,105,.40),rgba(132,72,38,.42) 54%,rgba(250,189,139,.18))}.rank{color:var(--gold);font-weight:800}.who{display:flex;min-width:0;align-items:center;gap:10px}.avatar{width:30px;height:30px;flex:0 0 30px;border-radius:7px;overflow:hidden;background:#263140;display:grid;place-items:center;color:#dce8f7;font-size:10px;font-weight:800}.avatar img{width:100%;height:100%;object-fit:cover}.name{font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{font-size:16px;font-weight:850}.verified-count{color:var(--text);opacity:.68;font-size:12px;font-weight:500;letter-spacing:.01em}.empty{padding:28px 16px;color:var(--muted);text-align:center}.detail-empty{padding:28px;color:var(--muted)}.detail-head{flex:none;padding:18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px}.detail-head .avatar{width:42px;height:42px;flex-basis:42px;border-radius:9px}.detail-title{min-width:0}.detail-title h3{font-size:18px;margin:0;overflow:hidden;text-overflow:ellipsis}.detail-title p{margin:1px 0 0;color:var(--muted);font-size:12px}.close{margin-left:auto;border:1px solid var(--line);background:transparent;color:var(--muted);width:31px;height:31px;border-radius:8px;font-size:20px;cursor:pointer}.close:hover{color:var(--text);background:#202a36}.cards{flex:1;padding:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:9px}.card{border:1px solid #26303d;background:#0a0f15;padding:11px;border-radius:10px;min-width:0}.track-link{display:block;text-decoration:none;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.track-link:hover{color:var(--gold)}.card-bottom{margin-top:9px;display:flex;align-items:center;gap:7px}.badge{font-size:9px;line-height:1;padding:5px 6px;border-radius:4px;font-weight:900;letter-spacing:.06em;background:#273342;color:#d8e6f4}.badge.beginner{background:#163c2a;color:#6cf0a7}.badge.easy{background:#123b42;color:#70ecf3}.badge.medium{background:#4a3714;color:#ffd36e}.badge.hard{background:#4b2320;color:#ffaaa3}.badge.expert{background:#38214d;color:#d7adff}.time{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:780}.check{color:var(--green);font-size:16px;font-weight:900;line-height:1}.foot{flex:none;margin-top:12px;color:#748190;font-size:12px}.foot a{color:#b9c6d3;text-decoration:none}.foot a:hover{text-decoration:underline}@media(max-width:820px){.layout{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr)}.meta{display:none}}@media(max-width:620px){.top{flex-wrap:wrap}.site-nav{margin-left:51px;order:3;flex-basis:calc(100% - 51px)}}@media(max-width:540px){.shell{width:min(100% - 22px,1180px);padding-top:16px}.top{margin-bottom:12px}.tools{align-items:stretch;flex-wrap:wrap}.search{flex-basis:100%}.toggle{margin-left:2px}.list-head,.row{grid-template-columns:42px 1fr 48px 58px;padding-left:11px;padding-right:11px}.cards{grid-template-columns:1fr}.verified-count{font-size:12px}.foot{display:none}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div class="mark">WR</div>
      <div><div class="eyebrow">COMMUNITY TOOL · UNOFFICIAL</div><h1>BOATLABS WR LEADERBOARD</h1></div>
      <nav class="site-nav" aria-label="Leaderboard sections"><a class="active" href="./" aria-current="page">WR leaderboard</a><a href="./performance/">Performance</a></nav>
      <div class="meta"><strong id="updated">Loading snapshot…</strong><span id="coverage"></span></div>
    </header>
    <div class="tools"><input id="search" class="search" type="search" autocomplete="off" placeholder="Search player or track"><label class="toggle"><input id="shared" type="checkbox" checked> Shared rank</label></div>
    <section class="layout"><div class="panel"><div class="list-head"><span>RANK</span><span>PLAYER</span><span>WR</span><span>VERIFIED</span></div><div id="rows"></div></div><aside id="detail" class="panel detail"><div class="detail-empty">Select a player to see the tracks they hold.</div></aside></section>
    <footer class="foot">Data source: <a href="https://boatlabs.net/tracks" target="_blank" rel="noreferrer">BoatLabs tracks</a> · This is an unofficial community project.</footer>
  </main>
  <script>
    const snapshot = ${data};
    const byId = (id) => document.getElementById(id);
    const initial = (name) => name.split(/[_ -]/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "?";
    function avatar(name, size="small") { const box=document.createElement("span"); box.className="avatar "+size; const img=new Image(); img.alt=""; img.loading="lazy"; img.src="https://mc-heads.net/avatar/"+encodeURIComponent(name)+"/48"; img.onerror=()=>{img.remove();box.textContent=initial(name)}; box.append(img); return box; }
    function difficulty(value) { const s=String(value||"Unknown"); const b=document.createElement("span"); b.className="badge "+s.toLowerCase().replace(/[^a-z]/g,""); b.textContent=s.toUpperCase(); return b; }
    const players = [...snapshot.winners.reduce((m, record) => { const entry=m.get(record.player)||{name:record.player,records:[]}; entry.records.push(record);m.set(record.player,entry);return m; },new Map()).values()].map(p=>({...p,count:p.records.length,verified:p.records.filter(r=>r.verified).length})).sort((a,b)=>b.count-a.count||b.verified-a.verified||a.name.localeCompare(b.name));
    function rankFor(player,index) { return byId("shared").checked ? players.filter(p=>p.count>=player.count).length : index+1; }
    function showPlayer(player) { const detail=byId("detail"); detail.replaceChildren(); const head=document.createElement("div");head.className="detail-head";head.append(avatar(player.name,"large"));const title=document.createElement("div");title.className="detail-title";title.innerHTML="<h3></h3><p></p>";title.querySelector("h3").textContent=player.name;title.querySelector("p").textContent=player.count+" world record"+(player.count===1?"":"s")+" · "+player.verified+" verified";head.append(title);const close=document.createElement("button");close.className="close";close.type="button";close.setAttribute("aria-label","Close player details");close.textContent="×";close.addEventListener("click",()=>detail.innerHTML='<div class="detail-empty">Select a player to see the tracks they hold.</div>');head.append(close);detail.append(head);const cards=document.createElement("div");cards.className="cards";[...player.records].sort((a,b)=>a.track.localeCompare(b.track)).forEach(record=>{const card=document.createElement("article");card.className="card";const link=document.createElement("a");link.className="track-link";link.href="https://boatlabs.net/tracks/"+encodeURIComponent(record.commandName);link.target="_blank";link.rel="noreferrer";link.textContent=record.track;card.append(link);const bottom=document.createElement("div");bottom.className="card-bottom";bottom.append(difficulty(record.difficulty));const time=document.createElement("span");time.className="time";time.textContent=record.time;bottom.append(time);if(record.verified){const check=document.createElement("span");check.className="check";check.title="Verified";check.textContent="✓";bottom.append(check)}card.append(bottom);cards.append(card)});detail.append(cards); }
    function render() { const q=byId("search").value.trim().toLowerCase();const rows=byId("rows");rows.replaceChildren();const filtered=players.filter(p=>!q||p.name.toLowerCase().includes(q)||p.records.some(r=>r.track.toLowerCase().includes(q)));if(!filtered.length){rows.innerHTML='<div class="empty">No player or track matches that search.</div>';return}filtered.forEach(player=>{const index=players.indexOf(player);const row=document.createElement("button");row.className="row "+(index===0?"podium-gold":index===1?"podium-silver":index===2?"podium-bronze":"");row.type="button";const rank=document.createElement("span");rank.className="rank";rank.textContent="#"+rankFor(player,index);row.append(rank);const who=document.createElement("span");who.className="who";who.append(avatar(player.name));const name=document.createElement("span");name.className="name";name.textContent=player.name;who.append(name);row.append(who);const count=document.createElement("span");count.className="count";count.textContent=player.count;row.append(count);const verified=document.createElement("span");verified.className="verified-count";verified.textContent=player.verified||"—";row.append(verified);row.addEventListener("click",()=>showPlayer(player));rows.append(row)}) }
    byId("updated").textContent="Snapshot · "+new Date(snapshot.fetchedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
    byId("coverage").textContent=snapshot.records+" records from "+snapshot.tracksScanned+" tracks"+(snapshot.failed?" · "+snapshot.failed+" unavailable":"");
    byId("search").addEventListener("input",render);byId("shared").addEventListener("change",render);render();
  </script>
</body>
</html>`;

await mkdir("site/performance", { recursive: true });
await writeFile("site/index.html", html);
await writeFile("site/performance/index.html", renderPerformancePage(performanceSnapshot));
await writeFile("site/.nojekyll", "");
console.log(`Built ${winners.length} records from ${tracks.length} tracks; ${failures.length} failed.`);
