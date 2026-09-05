const LIMIT = 365;
const asMap = (records = []) => new Map(records.map((record) => [record.commandName, record]));

export function initializeWrHistory(existing, snapshot, now = new Date()) {
  return existing || { trackingStartedAt: now.toISOString(), days: [] };
}

export function recordDailyWrChanges(history, previousWinners, currentWinners, now = new Date()) {
  const before = asMap(previousWinners), after = asMap(currentWinners), events = [];
  for (const [commandName, current] of after) {
    const old = before.get(commandName);
    if (!old) { events.push({ type: "new", track: current.track, commandName, player: current.player, time: current.time }); continue; }
    if (old.player !== current.player) events.push({ type: "take", track: current.track, commandName, from: old.player, player: current.player, fromTime: old.time, time: current.time });
    else if (old.time !== current.time) events.push({ type: "improve", track: current.track, commandName, player: current.player, fromTime: old.time, time: current.time });
  }
  const gains = {}, losses = {};
  for (const event of events) if (event.type === "take") { gains[event.player] = (gains[event.player] || 0) + 1; losses[event.from] = (losses[event.from] || 0) + 1; } else if (event.type === "new") gains[event.player] = (gains[event.player] || 0) + 1;
  const day = { at: now.toISOString(), events, gains, losses };
  return { ...history, days: [...history.days, day].slice(-LIMIT) };
}
