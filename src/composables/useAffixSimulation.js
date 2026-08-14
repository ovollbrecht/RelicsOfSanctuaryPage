// Spawn-chance engine for the affix calculator.
//
// Rules (see planetdiablo affix_info):
// - Magic: 50% suffix only, 25% prefix only, 25% both; each pick is
//   frequency-weighted from the eligible pool. Exact computation.
// - Rare: 3-6 affixes (jewels max 4), max 3 prefixes + 3 suffixes; each slot
//   dices prefix/suffix 50/50 while both are available; picks are
//   frequency-weighted and an already-used affix GROUP is excluded (pool
//   renormalizes). Affix-count distribution: the documented crafted table
//   shifted by +2 (community knowledge - the guide only documents crafted).
// - Crafted: up to 4 affixes with the documented ilvl table; same mechanics.
//
// Rare/crafted use Monte-Carlo simulation: exact enumeration over slot
// sequences with group exclusion is combinatorially messy, while 200k
// simulated rolls converge to ±0.1pp in well under a second.

const CRAFTED_COUNT_TABLE = [
  { maxIlvl: 30, counts: [1, 2, 3, 4], weights: [40, 20, 20, 20] },
  { maxIlvl: 50, counts: [2, 3, 4], weights: [60, 20, 20] },
  { maxIlvl: 70, counts: [3, 4], weights: [80, 20] },
  { maxIlvl: 99, counts: [4], weights: [100] },
];

function rollCount(ilvl, shift, cap, random) {
  const row = CRAFTED_COUNT_TABLE.find(r => ilvl <= r.maxIlvl) ?? CRAFTED_COUNT_TABLE.at(-1);
  let roll = random() * 100;
  for (let i = 0; i < row.counts.length; i++) {
    roll -= row.weights[i];
    if (roll <= 0) return Math.min(row.counts[i] + shift, cap);
  }
  return Math.min(row.counts.at(-1) + shift, cap);
}

function pickWeighted(pool, totalFrequency, random) {
  let roll = random() * totalFrequency;
  for (const entry of pool) {
    roll -= entry.frequency;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1];
}

/**
 * Magic items: exact probability that one roll yields all wanted groups.
 * wantedPrefixGroups/wantedSuffixGroups: arrays of Sets of affix ids (one Set
 * per wanted group - any member counts). At most one of each can succeed
 * since magic items get at most one prefix and one suffix.
 */
export function magicChance({ prefixes, suffixes, wantedPrefixIds, wantedSuffixIds }) {
  const wantP = wantedPrefixIds.size > 0;
  const wantS = wantedSuffixIds.size > 0;

  const share = (pool, wantedIds) => {
    const total = pool.reduce((sum, a) => sum + a.frequency, 0);
    if (total === 0) return 0;
    const wanted = pool.filter(a => wantedIds.has(a.id)).reduce((sum, a) => sum + a.frequency, 0);
    return wanted / total;
  };

  const pP = wantP ? share(prefixes, wantedPrefixIds) : 1;
  const pS = wantS ? share(suffixes, wantedSuffixIds) : 1;

  // slot probabilities: prefix appears in 50% of rolls, suffix in 75%
  if (wantP && wantS) return 0.25 * pP * pS;
  if (wantP) return 0.5 * pP;
  if (wantS) return 0.75 * pS;
  return 1;
}

// Precomputed sampling structure: cumulative frequency array for O(log n)
// weighted picks via binary search. Group exclusion uses rejection sampling
// (re-pick while the group is taken), which is statistically identical to
// renormalizing the remaining pool and keeps the hot loop allocation-free.
function buildSampler(pool) {
  const cumulative = new Float64Array(pool.length);
  let total = 0;
  pool.forEach((entry, i) => {
    total += entry.frequency;
    cumulative[i] = total;
  });
  return { pool, cumulative, total };
}

function samplePick(sampler, usedGroups, random, maxRetries = 60) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const roll = random() * sampler.total;
    let lo = 0, hi = sampler.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sampler.cumulative[mid] < roll) lo = mid + 1;
      else hi = mid;
    }
    const picked = sampler.pool[lo];
    if (!usedGroups.has(picked.group)) return picked;
  }
  // Nearly all groups taken (pathological) - fall back to a linear scan.
  const remaining = sampler.pool.filter(a => !usedGroups.has(a.group));
  if (remaining.length === 0) return null;
  return pickWeighted(remaining, remaining.reduce((s, a) => s + a.frequency, 0), random);
}

/**
 * Rare/crafted items: Monte-Carlo estimate that one roll yields at least one
 * member of every wanted group-selection.
 * pools: {prefixes, suffixes} with entries {id, group, frequency}.
 * wantedSelections: array of Sets of affix ids; every Set must be hit.
 */
export function rareCraftedChance({ prefixes, suffixes, wantedSelections, quality, ilvl, isJewel, iterations = 100_000, random = Math.random }) {
  const shift = quality === 'rare' ? 2 : 0;
  const cap = quality === 'rare' ? (isJewel ? 4 : 6) : 4;
  const maxPerSide = 3;

  const prefixSampler = buildSampler(prefixes);
  const suffixSampler = buildSampler(suffixes);
  const selections = wantedSelections.map(ids => ids);

  let hits = 0;
  const usedGroups = new Set();
  const rolled = [];

  for (let i = 0; i < iterations; i++) {
    const count = rollCount(ilvl, shift, cap, random);
    usedGroups.clear();
    rolled.length = 0;
    let prefixCount = 0;
    let suffixCount = 0;

    for (let slot = 0; slot < count; slot++) {
      const canP = prefixCount < maxPerSide && prefixSampler.total > 0;
      const canS = suffixCount < maxPerSide && suffixSampler.total > 0;
      let side;
      if (canP && canS) side = random() < 0.5 ? 'p' : 's';
      else if (canP) side = 'p';
      else if (canS) side = 's';
      else break;

      const picked = samplePick(side === 'p' ? prefixSampler : suffixSampler, usedGroups, random);
      if (picked === null) {
        // this side's groups are exhausted; try the other side once
        const other = samplePick(side === 'p' ? suffixSampler : prefixSampler, usedGroups, random);
        if (other === null) break;
        usedGroups.add(other.group);
        if (side === 'p') suffixCount++; else prefixCount++;
        rolled.push(other.id);
        continue;
      }
      usedGroups.add(picked.group);
      if (side === 'p') prefixCount++; else suffixCount++;
      rolled.push(picked.id);
    }

    let allWanted = true;
    for (const selection of selections) {
      let found = false;
      for (const id of rolled) {
        if (selection.has(id)) { found = true; break; }
      }
      if (!found) { allWanted = false; break; }
    }
    if (allWanted) hits++;
  }

  return hits / iterations;
}
