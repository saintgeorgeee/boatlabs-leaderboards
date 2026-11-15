import { mkdir, writeFile } from "node:fs/promises";

const DAY = 86_400_000;
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const hours = ms => new Intl.NumberFormat("en", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(ms / 3_600_000);
const difficultyClass = value => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
export const builderModes = [
  {slug:"builders-total", label:"Total played time", column:"TOTAL HOURS", score:p=>p.total},
  {slug:"builders-average", label:"Average per track", column:"AVG HOURS", score:p=>p.total/p.tracks.length},
];

export async function collectBuilders(catalog, previous = {}, fetcher = fetch, now = Date.now()) {
  const raw = Array.isArray(catalog) ? catalog : catalog?.tracks;
  if (!Array.isArray(raw) || !raw.length) throw new Error("Empty BoatLabs track catalog");
  const seen = new Set();
  const tracks = [];
  for (const t of raw) {
    if (!t?.command_name || t.open === false || seen.has(t.command_name.toLowerCase())) continue;
    seen.add(t.command_name.toLowerCase());
    const owner = String(t.owner ?? "").replace(/-/g, "").toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(owner) || /^0+$/.test(owner) ||
        !Number.isSafeInteger(t.total_time_spent) || t.total_time_spent < 0) continue;
    tracks.push({owner, track:t.display_name || t.name || t.command_name, command:t.command_name, ms:t.total_time_spent, difficulty:t.difficulty || null});
  }
  if (!tracks.length) throw new Error("No tracks with builder and played time");
  const owners = [...new Set(tracks.map(t=>t.owner))];
  const profiles = Object.fromEntries(owners.map(id=>[id,previous.profiles?.[id] ?? null]));
  const pending = owners.filter(id=>!(profiles[id]?.retryAt > now))
    .sort((a,b)=>Number(Boolean(profiles[a]))-Number(Boolean(profiles[b]))).slice(0, 40);
  let cursor = 0;
  const outcomes = {};
  const countOutcome = key => { outcomes[key] = (outcomes[key] || 0) + 1; };
  await Promise.all(Array.from({length:3}, async ()=>{
    while (cursor < pending.length) {
      const id = pending[cursor++];
      let name = profiles[id]?.name ?? null;
      let delay = DAY;
      try {
        const response = await fetcher("https://api.minecraftservices.com/minecraft/profile/lookup/"+id, {signal:AbortSignal.timeout(5000)});
        countOutcome(response.status);
        if (response.ok) {
          const profile = await response.json();
          if (profile.id?.replace(/-/g,"").toLowerCase() === id && /^[A-Za-z0-9_]{1,16}$/.test(profile.name)) {
            name = profile.name;
            delay = 30*DAY;
          }
        } else if (response.status === 404 || response.status === 204) delay = 7*DAY;
        else if (response.status === 429) {
          cursor = pending.length;
          console.warn("Minecraft profile lookup rate limited; deferring remaining lookups.");
        }
      } catch { countOutcome("error"); /* Keep the last verified name if the service is unavailable. */ }
      profiles[id] = {name,retryAt:now+delay};
    }
  }));
  console.log(`Builders: ${tracks.length} tracks, ${owners.length} owners, ${owners.filter(id=>!profiles[id]?.name).length} unresolved names. Profile lookup responses: ${JSON.stringify(outcomes)}`);
  return {fetchedAt:new Date(now).toISOString(), tracks, profiles};
}

export function rankBuilders(data, mode) {
  const byOwner = new Map();
  for (const track of data?.tracks ?? []) {
    const id = track.owner;
    const row = byOwner.get(id) ?? {id,name:data.profiles?.[id]?.name || "Unknown builder ("+id.slice(0,8)+")", total:0,tracks:[]};
    row.tracks.push(track);
    row.total += track.ms;
    byOwner.set(id,row);
  }
  let previousScore, rank;
  return [...byOwner.values()].sort((a,b)=>mode.score(b)-mode.score(a)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map((p,i)=>{
    const score = mode.score(p);
    if (score !== previousScore) rank = i+1;
    previousScore = score;
    return {...p, score, rank};
  });
}

export function renderBuilderChoices(data) {
  if (!data?.tracks?.length) return "";
  return '<h2 class="group-title">Builders</h2><section class="choices">'+builderModes.map(mode=>{
    const rows = rankBuilders(data,mode).slice(0,3).map(p=>`<div class="preview-row"><span class="rank">${p.rank}</span><img src="https://minotar.net/helm/${p.id}/32" alt=""><span class="name">${escape(p.name)}</span><strong>${hours(p.score)} h</strong></div>`).join("");
    return `<a class="choice performance" href="./${mode.slug}/"><span class="tag">BUILDERS</span><h1>${mode.label}</h1><div class="preview">${rows}</div><span class="arrow">View full leaderboard →</span></a>`;
  }).join("")+'</section>';
}

export function renderBuilderPage(data, mode) {
  const average = mode === builderModes[1];
  const builders = rankBuilders(data,mode);
  const avatar = p => `<img src="https://minotar.net/helm/${p.id}/48" loading="lazy" width="30" height="30" alt="">`;
  const rows = builders.map(p=>`<tr><td class="rank">#${p.rank}</td><th scope="row"><button type="button" class="builder-button" data-builder="${p.id}" aria-controls="builder-detail" aria-expanded="false">${avatar(p)}<span>${escape(p.name)}</span></button></th><td class="score">${hours(p.score)}</td>${average?`<td class="count">${p.tracks.length}</td>`:""}</tr>`).join("");
  const details = builders.map(p=>`<template id="builder-${p.id}">
    <div class="detail-head">${avatar(p)}<div><h2 tabindex="-1">${escape(p.name)}</h2><p>${p.tracks.length} ${p.tracks.length===1?"track":"tracks"} · ${hours(p.total)} h total${average?" · "+hours(p.score)+" h average":""}</p></div>
    <button class="close" type="button" aria-label="Close builder details">×</button></div>
    <div class="track-cards">${[...p.tracks].sort((a,b)=>b.ms-a.ms||a.track.localeCompare(b.track)).map(t=>
    `<article class="track-card"><a href="https://boatlabs.net/tracks/${encodeURIComponent(t.command)}" target="_blank" rel="noopener noreferrer">${escape(t.track)}</a>
    <div class="track-meta">${t.difficulty?`<span class="badge ${difficultyClass(t.difficulty)}">${escape(t.difficulty)}</span>`:""}<strong>${hours(t.ms)} h</strong></div></article>`).join("")}</div>
  </template>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoatLabs Builders · ${mode.label}</title>
<style>
:root{color-scheme:dark;--bg:#080b10;--line:#283242;--muted:#9ca8b5;--gold:#ffc85c}*{box-sizing:border-box}body{margin:0;background:radial-gradient(800px 460px at 85% -20%,#1a2636,transparent 70%),var(--bg);color:#f3f5f7;font:15px/1.45 system-ui,sans-serif}main{width:min(820px,calc(100% - 24px));margin:24px auto}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.home{color:var(--muted);text-decoration:none}h1{font-size:clamp(20px,4vw,30px);margin:16px 0 4px}nav{display:flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:10px}nav a{color:var(--muted);padding:6px 10px;text-decoration:none;border-radius:7px;font-weight:700;font-size:13px}nav a[aria-current]{background:var(--gold);color:#15100a}p{color:var(--muted);font-size:13px;margin:0 0 14px}input{width:100%;margin-bottom:12px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#0c1118;font:inherit;color:inherit}.panel{background:#10151d;border:1px solid var(--line);border-radius:13px;overflow:hidden}table{width:100%;border-collapse:collapse;text-align:left}thead{color:var(--muted);font-size:10px;letter-spacing:.08em}th,td{padding:10px 14px;border-bottom:1px solid var(--line)}tbody tr:last-child>*{border-bottom:0}tbody th{overflow-wrap:anywhere}tbody img{vertical-align:middle;border-radius:6px;margin-right:9px;background:#263140;image-rendering:pixelated}.rank{color:var(--gold);width:1%;font-weight:800}.numeric,.score,.count{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.score{font-weight:850}.count{color:var(--muted)}.empty{padding:12px}footer{color:var(--muted);font-size:12px;margin-top:12px}@media(max-width:480px){th,td{padding:9px 6px}tbody img{width:22px;height:22px;margin-right:4px}thead{font-size:9px;letter-spacing:0}table{font-size:13px}}
main{width:min(1180px,calc(100% - 24px))}[hidden]{display:none!important}.layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px;align-items:start}.board,.track-cards{max-height:65vh;overflow:auto;overscroll-behavior:contain}thead{position:sticky;top:0;background:#10151d;z-index:1}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.selected{background:#202938}.builder-button{border:0;background:none;color:inherit;padding:0;display:flex;gap:8px;align-items:center;font:inherit;text-align:left;cursor:pointer}.builder-button img{flex:none;margin:0}.detail-empty{padding:18px;margin:0}.detail-head{display:flex;align-items:center;gap:10px;padding:14px;border-bottom:1px solid var(--line)}.detail-head img{border-radius:6px;flex:none}.detail-head h2{margin:0;font-size:18px;overflow-wrap:anywhere}.detail-head p{margin:3px 0 0}.close{margin-left:auto;background:#19212c;border:1px solid var(--line);border-radius:7px;color:inherit;cursor:pointer;font-size:20px;min-width:32px}.track-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}.track-card{border:1px solid var(--line);background:#0a0f15;border-radius:9px;padding:10px;min-width:0}.track-card a{color:inherit;font-weight:750;overflow-wrap:anywhere;text-decoration:none}.track-card a:hover{text-decoration:underline}.track-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}.track-meta strong{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}.badge{color:#d8e6f4;background:#273342;font-size:10px;font-weight:800;padding:3px 5px;border-radius:4px;text-transform:uppercase}.badge.beginner{color:#6cf0a7;background:#163c2a}.badge.easy{color:#70ecf3;background:#123b42}.badge.medium{color:#ffd36e;background:#4a3714}.badge.hard{color:#ffaaa3;background:#4b2320}.badge.expert{color:#d7adff;background:#38214d}@media(max-width:720px){.layout{grid-template-columns:1fr}.layout:not(.has-detail) #builder-detail{display:none}.board{max-height:65vh}}@media(max-width:420px){.track-cards{grid-template-columns:1fr}}
</style></head><body><main>
<div class="top"><a class="home" href="../">← Home</a><nav aria-label="Builder leaderboards">${builderModes.map(x=>`<a href="../${x.slug}/"${x===mode?' aria-current="page"':""}>${x.label}</a>`).join("")}</nav></div>
<h1>Builders · ${mode.label}</h1>
<p>${average?"Total played time divided by tracks built, with no minimum track count.":"Total hours players spent on each builder’s tracks."} Credits use the official track owner. Only open tracks with recorded playtime are included.</p>
<input id="search" type="search" placeholder="Search builder" aria-label="Search builder" autocomplete="off">
<div class="layout" id="builder-layout"><div class="panel board" id="builder-board"><table><thead><tr><th scope="col">RANK</th><th scope="col">PLAYER</th><th scope="col" class="numeric">${mode.column}</th>${average?'<th scope="col" class="numeric">TRACKS BUILT</th>':""}</tr></thead><tbody>${rows}</tbody></table><p id="empty" class="empty" hidden>No matching builders.</p></div><aside class="panel" id="builder-detail" aria-label="Builder tracks"><p class="detail-empty">Select a builder to see their tracks.</p></aside></div>
<footer>Snapshot · <time datetime="${escape(data.fetchedAt)}">${new Date(data.fetchedAt).toISOString().slice(0,16).replace("T"," ")} UTC</time> · ${data.tracks.length} tracks</footer>
</main>${details}<script>
const rows=[...document.querySelectorAll("tbody tr")];
const board=document.getElementById("builder-board"),panel=document.getElementById("builder-detail"),layout=document.getElementById("builder-layout");
const emptyDetail=panel.firstElementChild;
let selected;
function closeDetails(){
  if(!selected)return;
  selected.setAttribute("aria-expanded","false");
  selected.closest("tr").classList.remove("selected");
  panel.replaceChildren(emptyDetail);
  layout.classList.remove("has-detail");
  selected.focus();
  selected=null;
}
board.addEventListener("click",event=>{
  const button=event.target.closest("tr")?.querySelector(".builder-button");
  if(!button)return;
  if(selected===button){closeDetails();return}
  if(selected){selected.setAttribute("aria-expanded","false");selected.closest("tr").classList.remove("selected")}
  selected=button;
  button.setAttribute("aria-expanded","true");
  button.closest("tr").classList.add("selected");
  panel.replaceChildren(document.getElementById("builder-"+button.dataset.builder).content.cloneNode(true));
  layout.classList.add("has-detail");
  panel.querySelector("h2").focus({preventScroll:true});
  if(matchMedia("(max-width:720px)").matches)panel.scrollIntoView({block:"start"});
});
panel.addEventListener("click",event=>{if(event.target.closest(".close"))closeDetails()});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&panel.contains(document.activeElement))closeDetails()});
document.getElementById("search").addEventListener("input",event=>{
  const query=event.target.value.trim().toLowerCase();
  let found=false;
  for(const row of rows){row.hidden=!row.cells[1].textContent.toLowerCase().includes(query);found ||= !row.hidden}
  document.getElementById("empty").hidden=found;
});
</script></body></html>`;
}

export async function writeBuilderPages(data) {
  if (!data?.tracks?.length) return;
  for (const mode of builderModes) {
    await mkdir("site/"+mode.slug,{recursive:true});
    await writeFile("site/"+mode.slug+"/index.html",renderBuilderPage(data,mode));
  }
}
