import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderSite } from "./site-template.mjs";
import { renderHomePage } from "./home-template.mjs";
import { renderGrindPage } from "./grind-template.mjs";
import { PERFORMANCE_POINTS, applyPerformanceWeights, toTrackStats } from "./performance-weighting.mjs";

const API = "https://api.boatlabs.net/v1/timingsystems";
const CONCURRENCY = 3;
const TIMEOUT_MS = 15_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const CACHE_FILE = ".leaderboard-cache.json";

async function requestJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "BoatLabs-Leaderboards/1.0 (daily GitHub Pages snapshot)" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally { clearTimeout(timeout); }
}

async function loadCache() { try { return JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { return null; } }

function formatTime(milliseconds) {
  const total = Number(milliseconds);
  if (!Number.isFinite(total)) return String(milliseconds);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const millis = Math.floor(total % 1_000);
  return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}` : `${seconds}.${String(millis).padStart(3, "0")}`;
}

function finishCount(track) { const value = Number(track.total_finishes ?? track.totalFinishes); return Number.isFinite(value) ? value : null; }
function rescore(placements) { return placements.map((placement) => ({ ...placement, basePoints: PERFORMANCE_POINTS[placement.position - 1], points: PERFORMANCE_POINTS[placement.position - 1] })); }

async function writeSite(snapshot, cache) {
  await mkdir("site/wr", { recursive: true }); await mkdir("site/performance", { recursive: true }); await mkdir("site/grind", { recursive: true });
  await writeFile("site/index.html", renderHomePage(snapshot));
  await writeFile("site/wr/index.html", renderSite(snapshot, "wr"));
  await writeFile("site/performance/index.html", renderSite(snapshot, "performance"));
  await writeFile("site/grind/index.html", renderGrindPage(snapshot));
  await writeFile(`site/${CACHE_FILE}`, JSON.stringify(cache)); await writeFile("site/.nojekyll", "");
}

const catalog = await requestJson(`${API}/getTracks`);
const tracks = (Array.isArray(catalog) ? catalog : catalog.tracks || []).filter((track) => track && track.open !== false && track.command_name);
const previous = await loadCache();
const now = new Date();
const previousFullScan = Date.parse(previous?.lastFullScan || "");
const fullScan = !previous || !Number.isFinite(previousFullScan) || now.getTime() - previousFullScan >= WEEK_MS;
const previousCounts = previous?.trackFinishes || {};
const currentCounts = Object.fromEntries(tracks.map((track) => [track.command_name, finishCount(track)]));
const currentTrackStats = toTrackStats(tracks);
const activeTracks = new Set(tracks.map((track) => track.command_name));
const targets = fullScan ? tracks : tracks.filter((track) => previousCounts[track.command_name] === undefined || currentCounts[track.command_name] === null || previousCounts[track.command_name] !== currentCounts[track.command_name]);

const winners = fullScan ? [] : (previous?.snapshot?.winners || []).filter((record) => activeTracks.has(record.commandName));
const performances = fullScan ? [] : rescore(previous?.snapshot?.performances || []).filter((record) => activeTracks.has(record.commandName));
const failures = []; let cursor = 0;
async function worker() {
  while (true) {
    const track = targets[cursor++]; if (!track) return;
    try {
      const detail = await requestJson(`${API}/getTrack/${encodeURIComponent(track.command_name)}`);
      const topList = Array.isArray(detail?.top_list) ? detail.top_list.slice(0, 20) : [];
      if (!fullScan) {
        for (let index = winners.length - 1; index >= 0; index--) if (winners[index].commandName === track.command_name) winners.splice(index, 1);
        for (let index = performances.length - 1; index >= 0; index--) if (performances[index].commandName === track.command_name) performances.splice(index, 1);
      }
      const trackData = { trackId: track.id ?? detail.id ?? track.command_name, track: track.name || detail.name || track.command_name, commandName: track.command_name, difficulty: track.difficulty || detail.difficulty || "Unknown" };
      const first = topList[0];
      if (first?.name && first.time != null) winners.push({ ...trackData, player: first.name, time: formatTime(first.time), verified: Boolean(first.verified) });
      topList.forEach((entry, index) => {
        if (!entry?.name || entry.time == null) return;
        performances.push({ ...trackData, player: entry.name, position: index + 1, basePoints: PERFORMANCE_POINTS[index], points: PERFORMANCE_POINTS[index], time: formatTime(entry.time), verified: Boolean(entry.verified) });
      });
    } catch (error) { failures.push({ track: track.command_name, error: error.message }); }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
winners.sort((a, b) => a.player.localeCompare(b.player) || a.track.localeCompare(b.track));
performances.sort((a, b) => a.player.localeCompare(b.player) || a.track.localeCompare(b.track) || a.position - b.position);
const rawSnapshot = { fetchedAt: now.toISOString(), tracksScanned: tracks.length, records: winners.length, placements: performances.length, failed: failures.length, winners, performances };
const snapshot = applyPerformanceWeights(rawSnapshot, currentTrackStats, now.getTime());
const cache = { version: 2, lastFullScan: fullScan ? snapshot.fetchedAt : previous.lastFullScan, trackFinishes: currentCounts, trackStats: currentTrackStats, snapshot };
await writeSite(snapshot, cache);
console.log(`${fullScan ? "Full" : "Incremental"} scan: ${targets.length} track details requested; ${winners.length} WRs and ${performances.length} placements from ${tracks.length} tracks; ${failures.length} failed.`);
