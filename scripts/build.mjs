import { mkdir, writeFile } from "node:fs/promises";

const API = "https://api.boatlabs.net/v1/timingsystems";
const CONCURRENCY = 3;
const TIMEOUT_MS = 15_000;

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
const failures = [];

async function worker() {
  while (true) {
    const track = tracks[cursor++];
    if (!track) return;
    try {
      const detail = await requestJson(`${API}/getTrack/${encodeURIComponent(track.command_name)}`);
      const first = detail?.top_list?.[0];
      if (!first?.name || first.time == null) continue;
      winners.push({
        trackId: track.id ?? detail.id ?? track.command_name,
        track: track.name || detail.name || track.command_name,
        commandName: track.command_name,
        difficulty: track.difficulty || detail.difficulty || "Unknown",
        player: first.name,
        time: formatTime(first.time),
        verified: Boolean(first.verified),
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

const snapshot = {
  fetchedAt: new Date().toISOString(),
  tracksScanned: tracks.length,
  records: winners.length,
  failed: failures.length,
  winners,
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
    :root{color-scheme:dark;--bg:#080b10;--panel:#10151d;--line:#242c37;--text:#f3f5f7;--muted:#9ca8b5;--gold:#ffc85c;--green:#54dc96;--cyan:#4ed9e4;--coral:#ff8e86;--purple:#c799ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 90% -20%,#1a2636 0%,transparent 66%),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(1180px,calc(100% - 32px));margin:auto;padding:26px 0 54px}.top{display:flex;align-items:center;gap:13px;margin-bottom:26px}.mark{width:38px;height:38px;display:grid;place-items:center;background:var(--gold);color:#15100a;font-weight:900;letter-spacing:-1px;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}.eyebrow{font-size:10px;letter-spacing:.14em;color:var(--muted);font-weight:800}.top h1{font-size:16px;letter-spacing:.03em;margin:2px 0 0}.meta{margin-left:auto;text-align:right;color:var(--muted);font-size:12px}.meta strong{display:block;color:var(--text);font-weight:650}.intro{padding:24px 0 20px;border-top:1px solid var(--line)}.intro h2{margin:0 0 6px;font-size:clamp(28px,5vw,52px);letter-spacing:-.055em;line-height:1}.intro p{max-width:680px;color:var(--muted);margin:12px 0 0}.tools{display:flex;gap:10px;align-items:center;margin:20px 0}.search{flex:1;min-width:0;border:1px solid var(--line);background:#0c1118;border-radius:10px;color:var(--text);padding:12px 14px;font:inherit;outline:none}.search:focus{border-color:#677586}.toggle{white-space:nowrap;display:flex;gap:8px;align-items:center;color:var(--muted);font-size:13px}.toggle input{accent-color:var(--gold);width:16px;height:16px}.layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(310px,.8fr);gap:16px;align-items:start}.panel{border:1px solid var(--line);background:linear-gradient(160deg,#111720,#0d1219);border-radius:14px;overflow:hidden}.list-head{padding:14px 16px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:52px 1fr 55px 74px;gap:8px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.12em}.row{width:100%;border:0;border-bottom:1px solid #202833;background:transparent;color:inherit;padding:10px 16px;display:grid;grid-template-columns:52px 1fr 55px 74px;gap:8px;align-items:center;text-align:left;font:inherit;cursor:pointer}.row:hover,.row:focus-visible{background:#19212c;outline:0}.rank{color:var(--gold);font-weight:800}.who{display:flex;min-width:0;align-items:center;gap:10px}.avatar{width:30px;height:30px;flex:0 0 30px;border-radius:7px;overflow:hidden;background:#263140;display:grid;place-items:center;color:#dce8f7;font-size:10px;font-weight:800}.avatar img{width:100%;height:100%;object-fit:cover}.name{font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.count{font-size:16px;font-weight:850}.verified-count{color:var(--green);font-weight:750}.empty{padding:28px 16px;color:var(--muted);text-align:center}.detail{min-height:360px}.detail-empty{padding:28px;color:var(--muted)}.detail-head{padding:18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:11px}.detail-head .avatar{width:42px;height:42px;flex-basis:42px;border-radius:9px}.detail-title{min-width:0}.detail-title h3{font-size:18px;margin:0;overflow:hidden;text-overflow:ellipsis}.detail-title p{margin:1px 0 0;color:var(--muted);font-size:12px}.close{margin-left:auto;border:1px solid var(--line);background:transparent;color:var(--muted);width:31px;height:31px;border-radius:8px;font-size:20px;cursor:pointer}.close:hover{color:var(--text);background:#202a36}.cards{padding:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.card{border:1px solid #26303d;background:#0a0f15;padding:11px;border-radius:10px;min-width:0}.track-link{display:block;text-decoration:none;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.track-link:hover{color:var(--gold)}.card-bottom{margin-top:9px;display:flex;align-items:center;gap:7px}.badge{font-size:9px;line-height:1;padding:5px 6px;border-radius:4px;font-weight:900;letter-spacing:.06em;background:#273342;color:#d8e6f4}.badge.beginner{background:#163c2a;color:#6cf0a7}.badge.easy{background:#123b42;color:#70ecf3}.badge.medium{background:#4a3714;color:#ffd36e}.badge.hard{background:#4b2320;color:#ffaaa3}.badge.expert{background:#38214d;color:#d7adff}.time{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:780}.check{color:var(--green);font-size:16px;font-weight:900;line-height:1}.foot{margin-top:15px;color:#748190;font-size:12px}.foot a{color:#b9c6d3;text-decoration:none}.foot a:hover{text-decoration:underline}@media(max-width:820px){.layout{grid-template-columns:1fr}.detail{min-height:0}.meta{display:none}}@media(max-width:540px){.shell{width:min(100% - 22px,1180px);padding-top:16px}.top{margin-bottom:18px}.intro h2{font-size:34px}.tools{align-items:stretch;flex-wrap:wrap}.search{flex-basis:100%}.toggle{margin-left:2px}.list-head,.row{grid-template-columns:42px 1fr 48px 58px;padding-left:11px;padding-right:11px}.cards{grid-template-columns:1fr}.verified-count{font-size:12px}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div class="mark">WR</div>
      <div><div class="eyebrow">COMMUNITY TOOL · UNOFFICIAL</div><h1>BOATLABS WR LEADERBOARD</h1></div>
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
    function showPlayer(player) { const detail=byId("detail"); detail.replaceChildren(); const head=document.createElement("div");head.className="detail-head";head.append(avatar(player.name,"large"));const title=document.createElement("div");title.className="detail-title";title.innerHTML="<h3></h3><p></p>";title.querySelector("h3").textContent=player.name;title.querySelector("p").textContent=player.count+" world record"+(player.count===1?"":"s")+" · "+player.verified+" verified";head.append(title);const close=document.createElement("button");close.className="close";close.type="button";close.setAttribute("aria-label","Close player details");close.textContent="×";close.addEventListener("click",()=>detail.innerHTML='<div class="detail-empty">Select a player to see the tracks they hold.</div>');head.append(close);detail.append(head);const cards=document.createElement("div");cards.className="cards";[...player.records].sort((a,b)=>a.track.localeCompare(b.track)).forEach(record=>{const card=document.createElement("article");card.className="card";const link=document.createElement("a");link.className="track-link";link.href="https://boatlabs.net/tracks/"+encodeURIComponent(record.commandName);link.target="_blank";link.rel="noreferrer";link.textContent=record.track;card.append(link);const bottom=document.createElement("div");bottom.className="card-bottom";bottom.append(difficulty(record.difficulty));const time=document.createElement("span");time.className="time";time.textContent=record.time;bottom.append(time);if(record.verified){const check=document.createElement("span");check.className="check";check.title="Verified";check.textContent="✓";bottom.append(check)}card.append(bottom);cards.append(card)});detail.append(cards); if(innerWidth<821) detail.scrollIntoView({behavior:"smooth",block:"start"}); }
    function render() { const q=byId("search").value.trim().toLowerCase();const rows=byId("rows");rows.replaceChildren();const filtered=players.filter(p=>!q||p.name.toLowerCase().includes(q)||p.records.some(r=>r.track.toLowerCase().includes(q)));if(!filtered.length){rows.innerHTML='<div class="empty">No player or track matches that search.</div>';return}filtered.forEach(player=>{const index=players.indexOf(player);const row=document.createElement("button");row.className="row";row.type="button";const rank=document.createElement("span");rank.className="rank";rank.textContent="#"+rankFor(player,index);row.append(rank);const who=document.createElement("span");who.className="who";who.append(avatar(player.name));const name=document.createElement("span");name.className="name";name.textContent=player.name;who.append(name);row.append(who);const count=document.createElement("span");count.className="count";count.textContent=player.count;row.append(count);const verified=document.createElement("span");verified.className="verified-count";verified.textContent=player.verified||"—";row.append(verified);row.addEventListener("click",()=>showPlayer(player));rows.append(row)}) }
    byId("updated").textContent="Snapshot · "+new Date(snapshot.fetchedAt).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
    byId("coverage").textContent=snapshot.records+" records from "+snapshot.tracksScanned+" tracks"+(snapshot.failed?" · "+snapshot.failed+" unavailable":"");
    byId("search").addEventListener("input",render);byId("shared").addEventListener("change",render);render();
  </script>
</body>
</html>`;

await mkdir("site", { recursive: true });
await writeFile("site/index.html", html);
await writeFile("site/.nojekyll", "");
console.log(`Built ${winners.length} records from ${tracks.length} tracks; ${failures.length} failed.`);
