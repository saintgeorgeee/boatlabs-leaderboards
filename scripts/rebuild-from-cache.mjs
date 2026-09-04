import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderSite } from "./site-template.mjs";
import { renderHomePage } from "./home-template.mjs";
import { renderGrindPage } from "./grind-template.mjs";
import { applyPerformanceWeights } from "./performance-weighting.mjs";

const CACHE_FILE = ".leaderboard-cache.json";
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/rebuild-from-cache.mjs <published-performance-page>");

const html = await readFile(sourcePath, "utf8");
const start = html.indexOf("const snapshot=") + "const snapshot=".length;
const end = html.indexOf(";\n    const points=", start);
if (start < "const snapshot=".length || end < start) throw new Error("Could not read the published snapshot.");
const rawSnapshot = JSON.parse(html.slice(start, end));

let previous = {};
try { previous = JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { throw new Error("The published metadata cache is unavailable; refusing to contact BoatLabs for a presentation-only rebuild."); }
if (!previous.trackStats) throw new Error("The published metadata cache is incomplete; refusing to contact BoatLabs for a presentation-only rebuild.");
const snapshot = applyPerformanceWeights(rawSnapshot, previous.trackStats, Date.now());
const cache = { ...previous, version: 3, snapshot };

await mkdir("site/wr", { recursive: true }); await mkdir("site/performance", { recursive: true }); await mkdir("site/grind", { recursive: true });
await writeFile("site/index.html", renderHomePage(snapshot));
await writeFile("site/wr/index.html", renderSite(snapshot, "wr"));
await writeFile("site/performance/index.html", renderSite(snapshot, "performance"));
await writeFile("site/grind/index.html", renderGrindPage(snapshot));
await writeFile(`site/${CACHE_FILE}`, JSON.stringify(cache)); await writeFile("site/.nojekyll", "");
console.log(`Rebuilt ${snapshot.records} WRs and ${snapshot.placements} placements entirely from the published cache; BoatLabs was not contacted.`);
