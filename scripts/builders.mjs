import { mkdir, writeFile } from "node:fs/promises";
import { leaderboardStyles } from "./site-template.mjs";

const DAY = 86_400_000;
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const hours = ms => new Intl.NumberFormat("en", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(ms / 3_600_000);
const wholeHours = ms => new Intl.NumberFormat("en", {maximumFractionDigits:0}).format(ms / 3_600_000);
const difficultyClass = value => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const MIN_AVERAGE_TRACKS = 3;
const byPlaytime = (a,b) => b.ms-a.ms || a.track.localeCompare(b.track) || a.command.localeCompare(b.command);
export const builderModes = [
  {slug:"builders-total", label:"Total played time", column:"TOTAL HOURS", nav:"Total time", score:p=>p.total},
  {slug:"builders-average", label:"Average per track", column:"AVG HOURS", nav:"Average time", minTracks:MIN_AVERAGE_TRACKS, score:p=>p.total/p.tracks.length},
  {slug:"builders-most-played", label:"Most played track", nav:"Top track", column:"PLAYED HOURS", single:true, score:p=>p.best.ms},
];

export async function collectBuilders(catalog, previous = {}, fetcher = fetch, now = Date.now(), {missingOnly = false} = {}) {
  const raw = Array.isArray(catalog) ? catalog : catalog?.tracks;
  if (!Array.isArray(raw) || !raw.length) throw new Error("Empty BoatLabs track catalog");
  const seen = new Set();
  const tracks = [];
  for (const t of raw) {
    if (!t?.command_name || t.open === false || seen.has(t.command_name.toLowerCase())) continue;
    seen.add(t.command_name.toLowerCase());
    const owner = String(t.owner ?? "").replace(/-/g, "").toLowerCase();
    if (!Number.isSafeInteger(t.total_time_spent) || t.total_time_spent < 0) continue;
    tracks.push({owner:/^[a-f0-9]{32}$/.test(owner) && !/^0+$/.test(owner) ? owner : null, track:t.display_name || t.name || t.command_name, command:t.command_name, ms:t.total_time_spent, difficulty:t.difficulty || null});
  }
  if (!tracks.length) throw new Error("No tracks with builder and played time");
  const owners = [...new Set(tracks.map(t=>t.owner).filter(Boolean))];
  const profiles = Object.fromEntries(owners.map(id=>[id,previous.profiles?.[id] ?? null]));
  let lookupAfter = previous.lookupAfter ?? 0;
  const pending = lookupAfter > now ? [] : owners.filter(id=>!(profiles[id]?.retryAt > now) && (!missingOnly || !profiles[id]?.name))
    .sort((a,b)=>Number(Boolean(profiles[a]?.name))-Number(Boolean(profiles[b]?.name)) ||
      (profiles[a]?.retryAt ?? 0)-(profiles[b]?.retryAt ?? 0)).slice(0, 40);
  let cursor = 0;
  const outcomes = {};
  const countOutcome = key => { outcomes[key] = (outcomes[key] || 0) + 1; };
  await Promise.all(Array.from({length:3}, async ()=>{
    while (cursor < pending.length) {
      const id = pending[cursor++];
      let name = profiles[id]?.name ?? null;
      let delay = DAY;
      let status = "temporary_error";
      try {
        const response = await fetcher("https://api.minecraftservices.com/minecraft/profile/lookup/"+id, {signal:AbortSignal.timeout(5000)});
        countOutcome(response.status);
        if (response.status === 404 || response.status === 204) {
          status = "not_found";
          delay = 7*DAY;
        } else if (response.ok) {
          const profile = await response.json();
          if (profile.id?.replace(/-/g,"").toLowerCase() === id && /^[A-Za-z0-9_]{1,16}$/.test(profile.name)) {
            name = profile.name;
            status = "resolved";
            delay = 30*DAY;
          }
        } else if (response.status === 429) {
          status = "rate_limited";
          cursor = pending.length;
          const retry = response.headers.get("Retry-After");
          const next = retry && /^\d+$/.test(retry) ? now+Number(retry)*1000 : Date.parse(retry||"");
          lookupAfter = Math.max(now+60*60*1000, Number.isFinite(next)?next:0);
          delay = lookupAfter-now;
          console.warn("Minecraft profile lookup rate limited; deferring remaining lookups.");
        }
      } catch { countOutcome("error"); /* Keep the last verified name if the service is unavailable. */ }
      profiles[id] = {name,retryAt:now+delay,status};
    }
  }));
  console.log(`Builders: ${tracks.length} tracks, ${owners.length} owners, ${owners.filter(id=>!profiles[id]?.name).length} unresolved names. Profile lookup responses: ${JSON.stringify(outcomes)}`);
  return {fetchedAt:new Date(now).toISOString(), tracks, profiles, lookupAfter};
}

export function rankBuilders(data, mode) {
  const byOwner = new Map();
  for (const track of data?.tracks ?? []) {
    const id = track.owner;
    if (!id) continue;
    const row = byOwner.get(id) ?? {id,name:data.profiles?.[id]?.name || "Unknown builder ("+id.slice(0,8)+")", total:0,tracks:[]};
    row.tracks.push(track);
    if (!row.best || byPlaytime(track,row.best)<0) row.best=track;
    row.total += track.ms;
    byOwner.set(id,row);
  }
  let previousScore, rank;
  return [...byOwner.values()].filter(p=>p.tracks.length >= (mode.minTracks ?? 1)).sort((a,b)=>mode.score(b)-mode.score(a)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map((p,i)=>{
    const score = mode.score(p);
    if (score !== previousScore) rank = i+1;
    previousScore = score;
    return {...p, score, rank};
  });
}

// Sample the same 8x8 face pixels at every render size. These signatures
// were measured from the providers' default/missing-profile renders.
const genericFaces = [1084160353,3079292036,587504647,2865648652,1175903024];
const tryNextAvatar = "const pending=JSON.parse(this.dataset.sources);const next=pending.shift();if(next){this.dataset.sources=JSON.stringify(pending);this.src=next}else{this.parentElement.textContent=this.dataset.initials}";
const checkAvatarFace = "let generic=false;try{const c=document.createElement('canvas');c.width=c.height=8;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(this,0,0,8,8);let h=2166136261;for(const byte of ctx.getImageData(0,0,8,8).data)h=Math.imul(h^byte,16777619);generic="+JSON.stringify(genericFaces)+".includes(h>>>0)}catch{}if(generic){"+tryNextAvatar+"}";

function builderAvatar(player, size, timestamp, preview = false) {
  const name = /^[A-Za-z0-9_]{1,16}$/.test(player.name) ? player.name : null;
  const id = encodeURIComponent(player.id);
  const initials = name?.split("_").filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase() || "?";
  const minotar = identifier => `https://minotar.net/helm/${identifier}/${size}?cache=${encodeURIComponent(timestamp)}`;
  const sources = [
    minotar(id),
    `https://mc-heads.net/avatar/${id}/${size}`,
    ...(name ? [minotar(encodeURIComponent(name))] : []),
    `https://skinrender.dev/render/${id}/face?size=${size}&hat=true&default=none`,
  ];
  const previewStyle = preview ? ' style="width:25px;height:25px;display:grid;place-items:center;background:#263140;border-radius:5px;font-size:10px;font-weight:800"' : "";
  return `<span class="avatar"${previewStyle}><img crossorigin="anonymous" data-sources="${escape(JSON.stringify(sources.slice(1)))}" data-initials="${escape(initials)}" loading="lazy" alt="" onload="${escape(checkAvatarFace)}" onerror="${escape(tryNextAvatar)}" src="${sources[0]}"></span>`;
}

function trackRankingLink(prefix) {
  return `<a href="${prefix}tracks-most-played/" style="display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;background:#10151d;color:#f3f5f7;text-decoration:none;text-align:left;font-size:12px"><strong>View all tracks by playtime</strong><span aria-hidden="true">→</span></a>`;
}

export function renderBuilderChoices(data) {
  if (!data?.tracks?.length) return "";
  return '<h2 class="group-title">Builders</h2><section class="choices">'+builderModes.map(mode=>{
    const rows = rankBuilders(data,mode).slice(0,3).map(p=>`<div class="preview-row"><span class="rank">${p.rank}</span>${builderAvatar(p,32,data.fetchedAt,true)}<span class="name" title="${escape(mode.single?p.best.track:p.name)}">${escape(p.name)}${mode.single?`<small style="display:block;overflow:hidden;text-overflow:ellipsis;color:var(--muted)">${escape(p.best.track)}</small>`:""}</span><strong>${hours(p.score)} h</strong></div>`).join("");
    return `<a class="choice performance" href="./${mode.slug}/"><span class="tag">BUILDERS</span><h1>${mode.label}</h1><div class="preview">${rows}</div><span class="arrow">View full leaderboard →</span></a>`;
  }).join("")+'</section>'+trackRankingLink('./');
}

export function renderBuilderPage(data, mode) {
  const average = mode === builderModes[1];
  const builders = rankBuilders(data, mode);
  const single = Boolean(mode.single);
  const scoreText = average || single ? hours : wholeHours;
  const avatar = player => builderAvatar(player,48,data.fetchedAt);
  const podium = ["podium-gold","podium-silver","podium-bronze"];
  const rows = builders.map((p,i)=>`<button type="button" class="row ${podium[i]||""}" data-builder="${p.id}" aria-controls="detail" aria-expanded="false">
    <span class="rank">#${p.rank}</span><span class="who">${avatar(p)}<span class="name">${escape(p.name)}${single?`<small class="best-track" title="${escape(p.best.track)}">${escape(p.best.track)}</small>`:""}</span></span><span class="score">${scoreText(p.score)}</span>${single?"":`<span class="secondary">${p.tracks.length}</span>`}</button>`).join("");
  const details = builders.map(p=>`<template id="builder-${p.id}"><div class="detail-head">${avatar(p)}<div class="detail-title"><h3>${escape(p.name)}</h3><p>${single?"Most played track":`${p.tracks.length} ${p.tracks.length===1?"track":"tracks"} · ${hours(p.total)} h total${average?" · "+hours(p.score)+" h average":""}`}</p></div>
    <button class="close" type="button" aria-label="Close builder details">×</button></div>
    <div class="cards">${(single?[p.best]:[...p.tracks].sort(byPlaytime)).map(t=>
      `<article class="card"><a class="track-link" href="https://boatlabs.net/tracks/${encodeURIComponent(t.command)}" target="_blank" rel="noopener noreferrer" title="${escape(t.track)}">${escape(t.track)}</a><div class="card-bottom">${t.difficulty?`<span class="badge ${difficultyClass(t.difficulty)}">${escape(t.difficulty)}</span>`:""}<span class="time">${hours(t.ms)} h</span></div></article>`).join("")}</div></template>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoatLabs Builders · ${mode.label}</title>
<style>${leaderboardStyles}
.list-head,.row{grid-template-columns:52px minmax(0,1fr) minmax(84px,auto)${single?"":" 70px"}}
.best-track{display:block;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:var(--muted);font-weight:500}
.points-panel .tt-points-details strong{color:var(--muted);font-size:12px}@media(max-width:620px){.points-panel .tt-points-details strong{font-size:11px}}
.list-head>*:nth-child(n+3),.score,.secondary{text-align:right}.score,.time{white-space:nowrap;font-variant-numeric:tabular-nums}.row[aria-expanded=true]{box-shadow:inset 3px 0 var(--gold)}[hidden]{display:none!important}
@media(max-width:820px){.layout.has-detail{grid-template-rows:minmax(0,1.15fr) minmax(180px,.85fr)}.layout:not(.has-detail){grid-template-rows:minmax(0,1fr) 0}.layout:not(.has-detail) #detail{display:none}}
@media(max-width:620px){.list-head,.row{grid-template-columns:36px minmax(0,1fr) minmax(70px,auto)${single?"":" 49px"}}.site-nav a{padding:5px 6px}.top h1{font-size:12px}}
@media(max-width:420px){.top{flex-wrap:wrap}.site-nav{margin-left:0}}
</style></head><body><main class="shell">
<header class="top"><a class="mark" href="../" aria-label="Home" style="text-decoration:none;flex:none">BL</a><div><div class="eyebrow">COMMUNITY TOOL · UNOFFICIAL</div><h1>BOATLABS BUILDERS</h1></div><nav class="site-nav" aria-label="Builder leaderboards">${builderModes.map(x=>`<a href="../${x.slug}/"${x===mode?' class="active" aria-current="page"':""}>${x.nav}</a>`).join("")}</nav><div class="meta"><strong>Snapshot · ${escape(data.fetchedAt.slice(0,10))}</strong><span>${data.tracks.length} tracks</span></div></header>
<div class="tools"><input id="search" class="search" type="search" placeholder="Search builder or track" aria-label="Search builder or track" autocomplete="off"></div>
${average?`<section class="points-panel"><div class="tt-points-details"><strong>Only players with AT LEAST ${MIN_AVERAGE_TRACKS} tracks appear here</strong></div></section>`:""}
<section id="layout" class="layout"><div class="panel"><div class="list-head"><span>RANK</span><span>PLAYER</span><span>${mode.column}</span>${single?"":"<span>TRACKS</span>"}</div><div id="rows">${rows}<p id="empty" class="empty" hidden>No matching builders or tracks.</p></div></div><aside id="detail" class="panel" aria-label="Builder tracks"><div class="detail-empty">Select a builder to see their tracks.</div></aside></section>
<footer class="foot">Credits use the official BoatLabs track owner. ${single?"Only the most played track per builder counts.":average?"Average = total hours divided by tracks built.":"Ranked by total played time; displayed to the nearest hour."}</footer>
${trackRankingLink("../")}
</main>${details}<script>
const rows=document.getElementById("rows"),panel=document.getElementById("detail"),layout=document.getElementById("layout");
const emptyDetail=panel.firstElementChild;
const list=[...rows.querySelectorAll(".row")];
const template=button=>document.getElementById("builder-"+button.dataset.builder).content;
const searchIndex=list.map(button=>button.textContent.toLowerCase()+" "+[...template(button).querySelectorAll(".track-link")].map(a=>a.textContent.toLowerCase()).join(" "));
let selected;
function closeDetails(){
  if(selected)selected.setAttribute("aria-expanded","false");
  panel.replaceChildren(emptyDetail);
  layout.classList.remove("has-detail");
  if(selected&&!selected.hidden)selected.focus();
  selected=null;
}
rows.addEventListener("click",event=>{
  const button=event.target.closest(".row");
  if(!button)return;
  if(selected)selected.setAttribute("aria-expanded","false");
  selected=button;
  button.setAttribute("aria-expanded","true");
  panel.replaceChildren(template(button).cloneNode(true));
  layout.classList.add("has-detail");
});
panel.addEventListener("click",event=>{if(event.target.closest(".close"))closeDetails()});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&selected)closeDetails()});
document.getElementById("search").addEventListener("input",event=>{
  const query=event.target.value.trim().toLowerCase();
  let found=false;
  list.forEach((button,i)=>{button.hidden=!searchIndex[i].includes(query);found ||= !button.hidden});
  document.getElementById("empty").hidden=found;
});
</script></body></html>`;
}

export function renderMostPlayedTracks(data) {
  const tracks = [...data.tracks].sort(byPlaytime);
  const rows = tracks.map((t,i)=>{
    const owner = t.owner ? data.profiles?.[t.owner]?.name : null;
    return `<a class="row ${["podium-gold","podium-silver","podium-bronze"][i]||""}" href="https://boatlabs.net/tracks/${encodeURIComponent(t.command)}" target="_blank" rel="noopener noreferrer">
      <span class="rank">#${i+1}</span><span class="name" title="${escape(t.track)}">${escape(t.track)}${owner?`<small class="secondary owner">${escape(owner)}</small>`:""}</span>
      <span class="track-difficulty">${t.difficulty?`<span class="badge ${difficultyClass(t.difficulty)}">${escape(t.difficulty)}</span>`:""}</span><span class="score">${hours(t.ms)}</span>
    </a>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoatLabs · Most Played Tracks</title>
<style>${leaderboardStyles}
.track-board{flex:1}[hidden]{display:none!important}.row,.list-head{grid-template-columns:56px minmax(0,1fr) 100px 112px}.row{text-decoration:none}.row:hover .name{text-decoration:underline}.score,.list-head>:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.owner{display:block;overflow:hidden;text-overflow:ellipsis}.list-head>:last-child{letter-spacing:.06em}
@media(max-width:620px){.row,.list-head{grid-template-columns:40px minmax(0,1fr) 65px 75px;gap:5px}.score{font-size:13px}.track-difficulty .badge{font-size:8px;padding:3px}.list-head{font-size:9px}}
</style></head><body><main class="shell">
<header class="top"><a class="mark" href="../" style="flex:none;text-decoration:none" aria-label="Home">BL</a><div><div class="eyebrow">COMMUNITY TOOL · UNOFFICIAL</div><h1>BOATLABS MOST PLAYED TRACKS</h1></div><div class="meta" style="margin-left:auto"><strong>${tracks.length} tracks</strong><span>Snapshot · ${escape(data.fetchedAt.slice(0,10))}</span></div></header>
<div class="tools"><input id="search" class="search" type="search" placeholder="Search track or builder" aria-label="Search track or builder" autocomplete="off"></div>
<section class="panel track-board" aria-label="All tracks by playtime"><div class="list-head"><span>RANK</span><span>TRACK</span><span>DIFFICULTY</span><span>PLAYED HOURS</span></div><div id="rows">${rows}<p id="empty" class="empty" hidden>No matching tracks.</p></div></section>
<footer class="foot">All open BoatLabs tracks with recorded playtime · Ranked by total hours played</footer>
</main><script>
const list=[...document.querySelectorAll("#rows .row")];
const index=list.map(row=>row.querySelector(".name").textContent.toLowerCase());
document.getElementById("search").addEventListener("input",event=>{
 const q=event.target.value.trim().toLowerCase();let found=false;
 list.forEach((row,i)=>{row.hidden=!index[i].includes(q);found ||= !row.hidden});
 document.getElementById("empty").hidden=found;
});
</script></body></html>`;
}

export async function writeBuilderPages(data) {
  if (!data?.tracks?.length) return;
  await mkdir("site/tracks-most-played",{recursive:true});
  await writeFile("site/tracks-most-played/index.html",renderMostPlayedTracks(data));
  for (const mode of builderModes) {
    await mkdir("site/"+mode.slug,{recursive:true});
    await writeFile("site/"+mode.slug+"/index.html",renderBuilderPage(data,mode));
  }
}
