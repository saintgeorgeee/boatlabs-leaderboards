const LIMIT = 365;
const asMap = (records = []) => new Map(records.map((record) => [record.commandName, record]));

// A daily sync runs just after midnight. Attribute it to the day that has just ended,
// while manual checks made before midnight keep their natural date.
function periodDate(now) {
  const shifted = new Date(now.getTime() - 60 * 60 * 1_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(shifted);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addTotals(left = {}, right = {}) {
  const total = { ...left };
  for (const [player, count] of Object.entries(right)) total[player] = (total[player] || 0) + count;
  return total;
}

function normalizeHistory(history) {
  if (!history) return null;
  const days = [];
  for (const source of history.days || []) {
    const date = source.date || periodDate(new Date(source.at));
    const previous = days.at(-1);
    if (previous?.date === date) {
      previous.at = source.at;
      previous.events.push(...(source.events || []));
      previous.gains = addTotals(previous.gains, source.gains);
      previous.losses = addTotals(previous.losses, source.losses);
    } else days.push({ ...source, date, events: [...(source.events || [])], gains: { ...(source.gains || {}) }, losses: { ...(source.losses || {}) } });
  }
  return { ...history, days: days.slice(-LIMIT) };
}

export function initializeWrHistory(existing, snapshot, now = new Date()) {
  return normalizeHistory(existing) || { trackingStartedAt: now.toISOString(), days: [] };
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
  const day = { at: now.toISOString(), date: periodDate(now), events, gains, losses };
  return normalizeHistory({ ...history, days: [...history.days, day] });
}
