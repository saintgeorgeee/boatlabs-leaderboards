import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderSite } from "./site-template.mjs";
import { renderHomePage } from "./home-template.mjs";

const PERFORMANCE_POINTS = [100, 75, 50, 38, 27, 22, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const sourcePath = process.argv[2];

if (!sourcePath) throw new Error("Usage: node scripts/rebuild-from-cache.mjs <published-performance-page>");

const html = await readFile(sourcePath, "utf8");
const start = html.indexOf("const snapshot=") + "const snapshot=".length;
const end = html.indexOf(";\n    const points=", start);
if (start < "const snapshot=".length || end < start) throw new Error("Could not read the published snapshot.");

const snapshot = JSON.parse(html.slice(start, end));
for (const placement of snapshot.performances) {
  placement.points = PERFORMANCE_POINTS[placement.position - 1];
}

await mkdir("site/wr", { recursive: true });
await mkdir("site/performance", { recursive: true });
await writeFile("site/index.html", renderHomePage(snapshot));
await writeFile("site/wr/index.html", renderSite(snapshot, "wr"));
await writeFile("site/performance/index.html", renderSite(snapshot, "performance"));
await writeFile("site/.nojekyll", "");
console.log(`Rebuilt ${snapshot.records} WRs and ${snapshot.placements} placements from the published snapshot without contacting BoatLabs.`);
