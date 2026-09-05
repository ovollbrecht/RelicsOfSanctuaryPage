#!/usr/bin/env node
/**
 * Builds src/assets/terror_zones.json - the single-player terror zone schedule
 * the Terror Zones page runs on.
 *
 * Two inputs. The zones themselves come from the game's own config,
 * scripts/data/desecratedzones.json (hd/global/excel in the game files): which
 * levels form a zone, in which order, plus the seed and the 30 minute cadence.
 * The schedule - which zone is up in which slot - is imported from d2emu.com's
 * precomputed calendar, because the generator behind Blizzard's seed is not
 * public and has not yielded to reverse engineering (see docs/terror-zones.md
 * in the tooling repo). Zone names, areas and superuniques are derived from
 * this site's own data, so only the slot sequence, the immunities and the
 * boss pack counts are taken over.
 *
 *   node scripts/import-terror-zones.mjs                # fetch from d2emu
 *   node scripts/import-terror-zones.mjs --from tz.json # use a saved copy
 *
 * Re-run it every month or two: the imported calendar reaches about four
 * months ahead, and the page says on which day it runs out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const SOURCE_PAGE = 'https://d2emu.com/tz-sp';
const SOURCE_DATA = 'https://d2emu.com/data/tz-2023-localized.json';
const SLOT_MS = 30 * 60 * 1000;
const IMMUNITY = { c: 'Cold', f: 'Fire', l: 'Lightning', p: 'Poison', ph: 'Physical', m: 'Magic',
  cold: 'Cold', fire: 'Fire', lightning: 'Lightning', poison: 'Poison', physical: 'Physical', magic: 'Magic' };

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
const config = readJson(resolve(root, arg('--zones') ?? 'scripts/data/desecratedzones.json')).desecrated_zones[0];
const areas = new Map(readJson(resolve(root, 'src/assets/dropcalc.json')).Areas.map((a) => [a.Id, a]));

const from = arg('--from');
const calendar = from
  ? readJson(resolve(process.cwd(), from))
  : await fetch(SOURCE_DATA).then((r) => { if (!r.ok) throw new Error(`${SOURCE_DATA}: HTTP ${r.status}`); return r.json(); });

// One entry per zone in the file's order - the order the game's index refers to.
// "Catacombs Level 1" through "Level 4" read as one place, as they do on the
// waypoint screen; the level list keeps every id for the drop calculator.
const placeName = (name) => name.replace(/ Level \d+$/, '');
// Two acts have a place called "Sewers", and seven tombs share a name.
const displayName = (name, act) => {
  if (name === 'Sewers') return act === 2 ? 'Lut Gholein Sewers' : 'Kurast Sewers';
  if (name === "Tal Rasha's Tomb") return "Tal Rasha's Tombs";
  return name;
};
const zones = config.zones.map((zone) => {
  const levelIds = zone.levels.map((l) => l.level_id);
  const act = areas.get(levelIds[0])?.Act ?? 0;
  const names = [];
  for (const id of levelIds) {
    const name = displayName(placeName(areas.get(id)?.Name ?? `Area ${id}`), act);
    if (names[names.length - 1] !== name) names.push(name);
  }
  const waypoint = zone.levels.find((l) => l.waypoint_level_id != null)?.waypoint_level_id ?? levelIds[0];
  return {
    key: zone.id,
    act,
    name: names.join(', '),
    short: names[0],
    areas: levelIds,
    waypoint,
    immunities: [],
    bossPacks: null,
  };
});

// The imported calendar names zones by their English label. Match each label
// to a config zone through the areas it lists - the first area name that is
// unique to one zone decides, which copes with d2emu's own wording ("Lut
// Gholein Sewers", "The Hole").
const normalise = (s) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const byPlace = new Map();
zones.forEach((zone, index) => {
  for (const part of zone.name.split(', ')) {
    const key = normalise(part);
    byPlace.set(key, byPlace.has(key) ? -1 : index);
  }
});
const aliases = { 'lut gholein sewers': 'Act2-Sewers', 'kurast sewers': 'Act3-Kurast', 'hole': 'Act1-Tower',
  'secret cow level': 'Act1-MooMooFarm', 'tal rashas tombs': 'Act2-TalRashas', 'nihlathaks temple': 'Act5-Halls',
  'temple halls': 'Act5-Halls', 'chaos sanctuary': 'Act4-ChaosSanctuary', 'ancients way': 'Act5-AncientsWay' };
const labelToIndex = new Map();
const resolveLabel = (label) => {
  if (labelToIndex.has(label)) return labelToIndex.get(label);
  let index = -1;
  for (const part of label.split(',')) {
    const key = normalise(part);
    if (aliases[key]) { index = zones.findIndex((z) => z.key === aliases[key]); break; }
    if ((byPlace.get(key) ?? -1) >= 0) { index = byPlace.get(key); break; }
  }
  if (index < 0) throw new Error(`No zone matches "${label}"`);
  labelToIndex.set(label, index);
  return index;
};

calendar.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
const first = new Date(calendar[0].datetime).getTime();
const zoneIndex = [];
calendar.forEach((entry, k) => {
  const t = new Date(entry.datetime).getTime();
  if (t !== first + k * SLOT_MS) throw new Error(`Gap in the calendar at ${entry.datetime}`);
  const index = resolveLabel(entry.zone.enUS);
  zoneIndex.push(index);
  const zone = zones[index];
  // The import spells immunities two ways ("Lightning" here, "l" there);
  // one vocabulary on the page.
  if (zone.immunities.length === 0 && entry.immunities?.length) {
    zone.immunities = [...new Set(entry.immunities.map((i) => IMMUNITY[i.toLowerCase()] ?? i))];
  }
  if (!zone.bossPacks && entry.numBossPacks?.length === 2) zone.bossPacks = [...entry.numBossPacks];
});

const seen = new Set(zoneIndex);
const unseen = zones.filter((_, i) => !seen.has(i)).map((z) => z.key);
if (unseen.length) console.warn(`WARNING: never scheduled in the import: ${unseen.join(', ')}`);

const out = {
  generatedAt: new Date().toISOString(),
  source: { name: 'd2emu.com', page: SOURCE_PAGE, data: SOURCE_DATA },
  config: {
    seed: String(config.seed),
    startUtc: config.start_time_utc.replace(' ', 'T') + 'Z',
    slotMinutes: config.zone_duration_minutes + config.break_duration_minutes,
  },
  zones,
  schedule: { firstSlotUtc: new Date(first).toISOString(), zoneIndex },
};
const target = resolve(root, 'src/assets/terror_zones.json');
writeFileSync(target, JSON.stringify(out));
const last = new Date(first + (zoneIndex.length - 1) * SLOT_MS);
console.log(`${zoneIndex.length} slots, ${zones.length} zones -> ${target}`);
console.log(`covers ${new Date(first).toISOString()} .. ${last.toISOString()}`);
