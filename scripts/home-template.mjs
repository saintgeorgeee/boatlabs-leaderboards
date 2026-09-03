export function renderHomePage(snapshot) {
  const updated = new Date(snapshot.fetchedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BoatLabs Leaderboards</title>
  <style>
    :root{color-scheme:dark;--bg:#080b10;--line:#2a3441;--text:#f3f5f7;--muted:#9ca8b5;--gold:#ffc85c;--cyan:#65ddea}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;background:radial-gradient(800px 480px at 85% -15%,#1a2636,transparent 68%),var(--bg);color:var(--text);font:15px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(760px,calc(100% - 32px));padding:32px 0}.brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:27px;color:var(--muted);font-size:11px;font-weight:850;letter-spacing:.13em}.mark{width:34px;height:34px;display:grid;place-items:center;background:var(--gold);color:#15100a;font-size:14px;font-weight:900;letter-spacing:-1px;clip-path:polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)}.choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.choice{min-height:180px;padding:20px;border:1px solid var(--line);border-radius:14px;background:#10161f;color:inherit;text-decoration:none;transition:.16s ease}.choice:hover{transform:translateY(-3px);border-color:#66798f;background:#141e2a}.choice .tag{display:block;color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.12em}.choice.performance .tag{color:var(--cyan)}h1{font-size:25px;letter-spacing:-.04em;margin:18px 0 5px}.choice p{margin:0;color:var(--muted);font-size:13px}.arrow{display:block;margin-top:25px;font-weight:850}.meta{margin-top:19px;color:#718090;text-align:center;font-size:11px}@media(max-width:560px){body{display:block}.shell{padding:34px 0}.choices{grid-template-columns:1fr}.choice{min-height:150px}}
  </style>
</head>
<body>
  <main class="shell">
    <div class="brand"><span class="mark">BL</span> BOATLABS LEADERBOARDS</div>
    <section class="choices">
      <a class="choice" href="./wr/"><span class="tag">WR</span><h1>WR Leaderboard</h1><p>World records per player.</p><span class="arrow">Open →</span></a>
      <a class="choice performance" href="./performance/"><span class="tag">TOP 20</span><h1>Performance</h1><p>Points from top-20 placements.<br>Work in progress.</p><span class="arrow">Open →</span></a>
    </section>
    <div class="meta">Snapshot · ${updated} · ${snapshot.tracksScanned} tracks</div>
  </main>
</body>
</html>`;
}
