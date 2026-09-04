const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function previewRow(player, index, label) {
  const name = escapeHtml(player.name);
  return `<div class="preview-row"><span class="rank">${index + 1}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/32" alt=""><span class="name">${name}</span><strong>${player.value} ${label}</strong></div>`;
}

export function renderHomePage(snapshot) {
  const updated = new Date(snapshot.fetchedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const wr = [...snapshot.winners.reduce((map, record) => {
    const player = map.get(record.player) || { name: record.player, value: 0, verified: 0 };
    player.value += 1;
    player.verified += Number(Boolean(record.verified));
    map.set(record.player, player);
    return map;
  }, new Map()).values()].sort((a, b) => b.value - a.value || b.verified - a.verified || a.name.localeCompare(b.name)).slice(0, 3);
  const performance = [...snapshot.performances.reduce((map, record) => {
    const player = map.get(record.player) || { name: record.player, value: 0, wins: 0 };
    player.value += record.points;
    player.wins += Number(record.position === 1);
    map.set(record.player, player);
    return map;
  }, new Map()).values()].sort((a, b) => b.value - a.value || b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 3);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BoatLabs Leaderboards</title>
  <style>
    :root{color-scheme:dark;--bg:#080b10;--line:#2a3441;--text:#f3f5f7;--muted:#9ca8b5;--gold:#ffc85c;--cyan:#65ddea}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;background:radial-gradient(800px 480px at 85% -15%,#1a2636,transparent 68%),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(760px,calc(100% - 32px));padding:32px 0}.brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:27px;color:var(--muted);font-size:11px;font-weight:850;letter-spacing:.13em}.mark{width:34px;height:34px;display:grid;place-items:center;background:var(--gold);color:#15100a;font-size:14px;font-weight:900;letter-spacing:-1px;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.choice{padding:20px;border:1px solid var(--line);border-radius:14px;background:#10161f;color:inherit;text-decoration:none;transition:.16s ease}.choice:hover{transform:translateY(-3px);border-color:#66798f;background:#141e2a}.choice .tag{display:block;color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.12em}.choice.performance .tag{color:var(--cyan)}h1{font-size:23px;letter-spacing:-.04em;margin:15px 0 14px}.preview{border-top:1px solid #25303d;padding-top:7px}.preview-row{display:grid;grid-template-columns:18px 27px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:39px;border-bottom:1px solid #202936;font-size:12px}.preview-row:last-child{border-bottom:0}.rank{color:var(--gold);font-weight:900}.performance .rank{color:var(--cyan)}.preview img{width:25px;height:25px;border-radius:5px;background:#263140}.name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.preview strong{font-size:11px}.arrow{display:block;margin-top:18px;font-weight:850}.grind-link{display:flex;align-items:center;gap:15px;margin-top:13px;padding:14px 17px;border:1px solid #5a4720;border-radius:12px;background:linear-gradient(105deg,rgba(95,67,19,.28),#10161f);color:inherit;text-decoration:none;transition:.16s ease}.grind-link:hover{transform:translateY(-2px);border-color:#90702d;background:linear-gradient(105deg,rgba(112,77,20,.38),#151d27)}.grind-link b{color:var(--gold);font-size:11px;letter-spacing:.11em}.grind-link span{color:var(--muted);font-size:12px}.grind-link strong{margin-left:auto;font-size:12px;white-space:nowrap}.meta{margin-top:19px;color:#718090;text-align:center;font-size:11px}@media(max-width:560px){body{display:block}.shell{padding:34px 0}.choices{grid-template-columns:1fr}.grind-link{display:grid;gap:4px}.grind-link strong{margin-left:0;margin-top:4px}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand"><span class="mark">BL</span> BOATLABS LEADERBOARDS</div>
    <section class="choices">
      <a class="choice" href="./wr/"><span class="tag">WR LEADERBOARD</span><h1>Current leaders</h1><div class="preview">${wr.map((player, index) => previewRow(player, index, "WR")).join("")}</div><span class="arrow">View full leaderboard →</span></a>
      <a class="choice performance" href="./performance/"><span class="tag">PERFORMANCE · WIP</span><h1>Current leaders</h1><div class="preview">${performance.map((player, index) => previewRow(player, index, "pts")).join("")}</div><span class="arrow">View full leaderboard →</span></a>
    </section>
    <a class="grind-link" href="./grind/"><div><b>MOST GRINDED TRACKS</b><span>See every track’s total time spent and current grind multiplier.</span></div><strong>View tracks →</strong></a>
    <div class="meta">Snapshot · ${updated} · ${snapshot.tracksScanned} tracks</div>
  </main>
</body>
</html>`;
}
