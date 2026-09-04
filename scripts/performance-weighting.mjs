export const PERFORMANCE_POINTS = [100, 75, 50, 38, 27, 22, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

const DAY = 86_400_000;
const TOP_MULTIPLIER = 2.1;
const MID_MULTIPLIER = 1.3;

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function logarithmicBlend(from, to, progress) {
  return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * smoothstep(progress));
}

function grindMultiplier(percentile) {
  const low = 1 / TOP_MULTIPLIER;
  const midLow = 1 / MID_MULTIPLIER;
  if (percentile <= 0.04) return low;
  if (percentile < 0.16) return logarithmicBlend(low, midLow, (percentile - 0.04) / 0.12);
  if (percentile <= 0.84) return Math.exp(Math.log(MID_MULTIPLIER) * ((percentile - 0.5) / 0.34));
  if (percentile < 0.96) return logarithmicBlend(MID_MULTIPLIER, TOP_MULTIPLIER, (percentile - 0.84) / 0.12);
  return TOP_MULTIPLIER;
}

function percentiles(items, valueKey) {
  const sorted = [...items].sort((a, b) => a[valueKey] - b[valueKey] || a.commandName.localeCompare(b.commandName));
  const result = new Map();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end][valueKey] === sorted[start][valueKey]) end += 1;
    const percentile = sorted.length <= 1 ? 0.5 : ((start + end - 1) / 2) / (sorted.length - 1);
    for (let index = start; index < end; index += 1) result.set(sorted[index].commandName, percentile);
    start = end;
  }
  return result;
}

/**
 * Gives each public top-20 result its final, weighted score.
 * The rank of a track's grind intensity is used rather than the raw number,
 * so one exceptional track cannot distort every other score.
 */
export function applyPerformanceWeights(snapshot, trackStats = {}, now = Date.now()) {
  const trackCommands = new Set();
  const trackNames = new Map();
  for (const placement of snapshot.performances || []) {
    if (placement.position === 1) {
      trackCommands.add(placement.commandName);
      trackNames.set(placement.commandName, placement.track || placement.commandName);
    }
  }

  const eligible = [];
  for (const commandName of trackCommands) {
    const stats = trackStats[commandName] || {};
    const createdAt = Number(stats.createdAt);
    const totalTimeSpent = Number(stats.totalTimeSpent);
    const ageDays = (now - createdAt) / DAY;
    if (!Number.isFinite(createdAt) || !Number.isFinite(totalTimeSpent) || totalTimeSpent <= 0 || ageDays <= 30) continue;
    eligible.push({
      commandName,
      ageDays,
      // The public total time spent is the only factor used to rank grind.
      grindIntensity: totalTimeSpent,
    });
  }

  const grindPercentiles = percentiles(eligible, "grindIntensity");
  const weights = new Map();
  for (const track of eligible) {
    const grind = grindMultiplier(grindPercentiles.get(track.commandName));
    const fadeIn = track.ageDays >= 60 ? 1 : smoothstep((track.ageDays - 30) / 30);
    weights.set(track.commandName, {
      multiplier: 1 + (grind - 1) * fadeIn,
      grindMultiplier: grind,
      percentile: grindPercentiles.get(track.commandName),
      ageDays: track.ageDays,
    });
  }

  const performances = (snapshot.performances || []).map((placement) => {
    const basePoints = PERFORMANCE_POINTS[placement.position - 1] ?? placement.basePoints ?? placement.points ?? 0;
    const weight = weights.get(placement.commandName);
    const multiplier = weight?.multiplier ?? 1;
    return {
      ...placement,
      basePoints,
      points: Math.max(1, Math.round(basePoints * multiplier)),
      trackMultiplier: Number(multiplier.toFixed(4)),
      grindMultiplier: weight && Number(weight.grindMultiplier.toFixed(4)),
      ageDays: weight && Number(weight.ageDays.toFixed(1)),
    };
  });
  const grindTracks = [...weights.entries()]
    .map(([commandName, weight]) => ({
      commandName,
      track: trackNames.get(commandName) || commandName,
      totalTimeSpent: Number(trackStats[commandName]?.totalTimeSpent) || 0,
      ageDays: Number(weight.ageDays.toFixed(1)),
      multiplier: Number(weight.multiplier.toFixed(4)),
      baseGrindMultiplier: Number(weight.grindMultiplier.toFixed(4)),
      percentile: Number(weight.percentile.toFixed(4)),
    }))
    .sort((a, b) => b.totalTimeSpent - a.totalTimeSpent || a.track.localeCompare(b.track));

  return {
    ...snapshot,
    performances,
    grindTracks,
    weighting: {
      eligibleTracks: eligible.length,
      newTracks: Math.max(0, trackCommands.size - eligible.length),
      topGrindMultiplier: TOP_MULTIPLIER,
      lowGrindMultiplier: Number((1 / TOP_MULTIPLIER).toFixed(4)),
    },
  };
}

export function toTrackStats(tracks) {
  return Object.fromEntries(tracks.map((track) => {
    const rawCreated = Number(track.date_created ?? track.dateCreated);
    const createdAt = rawCreated > 0 && rawCreated < 10_000_000_000 ? rawCreated * 1_000 : rawCreated;
    return [track.command_name, {
      createdAt: Number.isFinite(createdAt) ? createdAt : null,
      totalTimeSpent: Number(track.total_time_spent ?? track.totalTimeSpent) || 0,
    }];
  }));
}
