import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderSite } from "./site-template.mjs";
import { renderHomePage } from "./home-template.mjs";
import { applyPerformanceWeights, toTrackStats } from "./performance-weighting.mjs";

const API = "https://api.boatlabs.net/v1/timingsystems";
const TIMEOUT_MS = 15_000;
const CACHE_FILE = ".leaderboard-cache.json";
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/rebuild-from-cache.mjs <published-performance-page>");

async function requestJson(url) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "BoatLabs-Leaderboards/1.0 (metadata refresh)" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally { clearTimeout(timeout); }
}

const html = await readFile(sourcePath, "utf8");
const start = html.indexOf("const snapshot=") + "const snapshot=".length;
const end = html.indexOf(";\n    const points=", start);
if (start < "const snapshot=".length || end < start) throw new Error("Could not read the published snapshot.");
const rawSnapshot = JSON.parse(html.slice(start, end));

// Deliberately one request only: this endpoint includes all public track metadata.
const catalog = await requestJson(`${API}/getTracks`);
const tracks = (Array.isArray(catalog) ? catalog : catalog.tracks || []).filter((track) => track && track.open !== false && track.command_name);
const trackStats = toTrackStats(tracks);
const snapshot = applyPerformanceWeights(rawSnapshot, trackStats, Date.now());

let previous = {};
try { previous = JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { /* The site can still be rebuilt safely. */ }
const trackFinishes = Object.fromEntries(tracks.map((track) => {
  const finishes = Number(track.total_finishes ?? track.totalFinishes);
  return [track.command_name, Number.isFinite(finishes) ? finishes : null];
}));
const cache = { version: 2, lastFullScan: previous.lastFullScan || snapshot.fetchedAt, trackFinishes, trackStats, snapshot };

await mkdir("site/wr", { recursive: true }); await mkdir("site/performance", { recursive: true });
await writeFile("site/index.html", renderHomePage(snapshot));
await writeFile("site/wr/index.html", renderSite(snapshot, "wr"));
await writeFile("site/performance/index.html", renderSite(snapshot, "performance"));
await writeFile(`site/${CACHE_FILE}`, JSON.stringify(cache)); await writeFile("site/.nojekyll", "");
console.log(`Rebuilt ${snapshot.records} WRs and ${snapshot.placements} placements with one public track-list metadata request; no track leaderboards were read.`);
