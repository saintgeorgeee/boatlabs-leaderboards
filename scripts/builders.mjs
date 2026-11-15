import { mkdir, writeFile } from "node:fs/promises";
import { leaderboardStyles } from "./site-template.mjs";

const DAY = 86_400_000;
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const hours = ms => new Intl.NumberFormat("en", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(ms / 3_600_000);
const wholeHours = ms => new Intl.NumberFormat("en", {maximumFractionDigits:0}).format(ms / 3_600_000);
const difficultyClass = value => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const MIN_AVERAGE_TRACKS = 3;
export const builderModes = [
  {slug:"builders-total", label:"Total played time", column:"TOTAL HOURS", score:p=>p.total},
  {slug:"builders-average", label:"Average per track", column:"AVG HOURS", minTracks:MIN_AVERAGE_TRACKS, score:p=>p.total/p.tracks.length},
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
    if (!/^[a-f0-9]{32}$/.test(owner) || /^0+$/.test(owner) ||
        !Number.isSafeInteger(t.total_time_spent) || t.total_time_spent < 0) continue;
    tracks.push({owner, track:t.display_name || t.name || t.command_name, command:t.command_name, ms:t.total_time_spent, difficulty:t.difficulty || null});
  }
  if (!tracks.length) throw new Error("No tracks with builder and played time");
  const owners = [...new Set(tracks.map(t=>t.owner))];
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
    const row = byOwner.get(id) ?? {id,name:data.profiles?.[id]?.name || "Unknown builder ("+id.slice(0,8)+")", total:0,tracks:[]};
    row.tracks.push(track);
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

export function renderBuilderChoices(data) {
  if (!data?.tracks?.length) return "";
  return '<h2 class="group-title">Builders</h2><section class="choices">'+builderModes.map(mode=>{
    const rows = rankBuilders(data,mode).slice(0,3).map(p=>`<div class="preview-row"><span class="rank">${p.rank}</span><img src="https://minotar.net/helm/${p.id}/32" alt=""><span class="name">${escape(p.name)}</span><strong>${hours(p.score)} h</strong></div>`).join("");
    return `<a class="choice performance" href="./${mode.slug}/"><span class="tag">BUILDERS</span><h1>${mode.label}</h1><div class="preview">${rows}</div><span class="arrow">View full leaderboard →</span></a>`;
  }).join("")+'</section>';
}

export function renderBuilderPage(data, mode) {
  const average = mode === builderModes[1];
  const builders = rankBuilders(data, mode);
  const scoreText = average ? hours : wholeHours;
  const avatar = id => `<span class="avatar"><img src="https://minotar.net/helm/${id}/48" loading="lazy" alt=""></span>`;
  const podium = ["podium-gold","podium-silver","podium-bronze"];
  const rows = builders.map((p,i)=>`<button type="button" class="row ${podium[i]||""}" data-builder="${p.id}" aria-controls="detail" aria-expanded="false">
    <span class="rank">#${p.rank}</span><span class="who">${avatar(p.id)}<span class="name">${escape(p.name)}</span></span><span class="score">${scoreText(p.score)}</span><span class="secondary">${p.tracks.length}</span></button>`).join("");
  const details = builders.map(p=>`<template id="builder-${p.id}"><div class="detail-head">${avatar(p.id)}<div class="detail-title"><h3>${escape(p.name)}</h3><p>${p.tracks.length} ${p.tracks.length===1?"track":"tracks"} · ${hours(p.total)} h total${average?" · "+hours(p.score)+" h average":""}</p></div>
    <button class="close" type="button" aria-label="Close builder details">×</button></div>
    <div class="cards">${[...p.tracks].sort((a,b)=>b.ms-a.ms||a.track.localeCompare(b.track)).map(t=>
      `<article class="card"><a class="track-link" href="https://boatlabs.net/tracks/${encodeURIComponent(t.command)}" target="_blank" rel="noopener noreferrer" title="${escape(t.track)}">${escape(t.track)}</a><div class="card-bottom">${t.difficulty?`<span class="badge ${difficultyClass(t.difficulty)}">${escape(t.difficulty)}</span>`:""}<span class="time">${hours(t.ms)} h</span></div></article>`).join("")}</div></template>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BoatLabs Builders · ${mode.label}</title>
<style>${leaderboardStyles}
.list-head,.row{grid-template-columns:52px minmax(0,1fr) minmax(84px,auto) 70px}
.points-panel .tt-points-details strong{color:var(--muted);font-size:12px}@media(max-width:620px){.points-panel .tt-points-details strong{font-size:11px}}
.list-head>*:nth-child(n+3),.score,.secondary{text-align:right}.score,.time{white-space:nowrap;font-variant-numeric:tabular-nums}.row[aria-expanded=true]{box-shadow:inset 3px 0 var(--gold)}[hidden]{display:none!important}
@media(max-width:820px){.layout.has-detail{grid-template-rows:minmax(0,1.15fr) minmax(180px,.85fr)}.layout:not(.has-detail){grid-template-rows:minmax(0,1fr) 0}.layout:not(.has-detail) #detail{display:none}}
@media(max-width:620px){.list-head,.row{grid-template-columns:36px minmax(0,1fr) minmax(70px,auto) 49px}.site-nav a{padding:5px 6px}.top h1{font-size:12px}}
</style></head><body><main class="shell">
<header class="top"><a class="mark" href="../" aria-label="Home" style="text-decoration:none;flex:none">BL</a><div><div class="eyebrow">COMMUNITY TOOL · UNOFFICIAL</div><h1>BOATLABS BUILDERS</h1></div><nav class="site-nav" aria-label="Builder leaderboards">${builderModes.map(x=>`<a href="../${x.slug}/"${x===mode?' class="active" aria-current="page"':""}>${x===builderModes[0]?"Total time":"Average time"}</a>`).join("")}</nav><div class="meta"><strong>Snapshot · ${escape(data.fetchedAt.slice(0,10))}</strong><span>${data.tracks.length} tracks</span></div></header>
<div class="tools"><input id="search" class="search" type="search" placeholder="Search builder or track" aria-label="Search builder or track" autocomplete="off"></div>
${average?`<section class="points-panel"><div class="tt-points-details"><strong>Only players with AT LEAST ${MIN_AVERAGE_TRACKS} tracks appear here</strong></div></section>`:""}
<section id="layout" class="layout"><div class="panel"><div class="list-head"><span>RANK</span><span>PLAYER</span><span>${mode.column}</span><span>TRACKS</span></div><div id="rows">${rows}<p id="empty" class="empty" hidden>No matching builders or tracks.</p></div></div><aside id="detail" class="panel" aria-label="Builder tracks"><div class="detail-empty">Select a builder to see their tracks.</div></aside></section>
<footer class="foot">Credits use the official BoatLabs track owner. ${average?"Average = total hours divided by tracks built.":"Ranked by total played time; displayed to the nearest hour."}</footer>
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

export async function writeBuilderPages(data) {
  if (!data?.tracks?.length) return;
  for (const mode of builderModes) {
    await mkdir("site/"+mode.slug,{recursive:true});
    await writeFile("site/"+mode.slug+"/index.html",renderBuilderPage(data,mode));
  }
}
