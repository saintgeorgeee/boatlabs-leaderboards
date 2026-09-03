# BoatLabs WR Leaderboard

An unofficial, static BoatLabs world-record leaderboard.

The GitHub Actions workflow rebuilds the site once a day and publishes it to GitHub Pages. Visitors only receive the generated snapshot: their browser never calls BoatLabs.

## Updating

- Scheduled run: every day at `04:17 UTC`
- Manual run: **Actions → Update BoatLabs WR leaderboard → Run workflow**
- The collector uses at most three concurrent requests and ignores tracks without a completed time.

## Local preview

```bash
npm run build
npx serve site
```

No npm dependencies are required; Node 20 or newer is enough.
