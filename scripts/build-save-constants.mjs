#!/usr/bin/env node
/**
 * Builds src/assets/save_constants.json - what the Grail page needs to read
 * D2R save files in the browser.
 *
 * Two halves. `constants` is the d2s parser's own lookup data (stat save bits,
 * item codes, unique/set/runeword tables), produced by the vendored parser
 * from the same game files an install has: the mod's tables from the
 * reference build, vanilla's for the rest. `catalog` is the Grail's checklist:
 * every unique, set item and runeword by the id a save file stores - the row
 * count of its table, as the game counts - with the name the site uses.
 *
 * Reads the paths from the tooling repo's d2mod.json (generate.from and
 * vanillaDataPath); pass --config to point elsewhere.
 *
 *   node scripts/build-save-constants.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d2s from '../src/vendor/d2s.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const configPath = resolve(root, arg('--config') ?? '../../RiderProjects/D2ModTooling/d2mod.json');
const configText = readFileSync(configPath, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
const config = JSON.parse(configText);
const toolingRoot = dirname(configPath);
const BUILD = resolve(toolingRoot, config.generate.from);
const VANILLA = config.vanillaDataPath;

const pick = (rel) => {
  for (const base of [BUILD, VANILLA]) {
    const p = resolve(base, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(`neither the build nor vanilla has ${rel}`);
};
const readText = (rel) => readFileSync(pick(rel), 'utf8').replace(/^﻿/, '');

const STRINGS = ['item-gems.json', 'item-modifiers.json', 'item-nameaffixes.json', 'item-names.json', 'item-runes.json', 'skills.json'];
const TABLES = ['charstats', 'playerclass', 'skilldesc', 'skills', 'raresuffix', 'rareprefix', 'magicprefix', 'magicsuffix', 'properties',
  'itemstatcost', 'runes', 'setitems', 'uniqueitems', 'itemtypes', 'armor', 'weapons', 'misc', 'gems', 'actinfo', 'levels'];
const buffers = {};
for (const name of STRINGS) buffers[name] = readText(`local/lng/strings/${name}`);
for (const table of TABLES) buffers[`${table}.txt`] = readText(`global/excel/${table}.txt`);

const constants = d2s.readConstantData(buffers);

// ---- the catalog ----
const tsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [header[i], v])));
};
const strings = new Map();
for (const name of STRINGS) for (const e of JSON.parse(buffers[name])) if (e.Key) strings.set(e.Key, e);
const displayName = (key) => strings.get(key)?.enUS ?? key;
const dropcalc = JSON.parse(readFileSync(resolve(root, 'src/assets/dropcalc.json'), 'utf8'));
const spawnableUnique = new Map(dropcalc.Uniques.map((u) => [u.Index, u.Spawnable !== false]));
const spawnableSet = new Map(dropcalc.Sets.map((s) => [s.Index, s.Spawnable !== false]));
const baseByCode = new Map(dropcalc.BaseItems.map((b) => [b.Code, b]));

// the slot an item goes in, from the type hierarchy: a Pelt is a Helm, a
// Voodoo Head a Shield, an Orb a Weapon
const itemBases = JSON.parse(readFileSync(resolve(root, 'src/assets/item_bases.json'), 'utf8'));
const typeParents = new Map(itemBases.Types.map((t) => [t.Code, t.Parents ?? []]));
const typeName = new Map(itemBases.Types.map((t) => [t.Code, t.Name]));
const ancestors = (code) => {
  const seen = new Set(); const stack = [code];
  while (stack.length) { const c = stack.pop(); if (!c || seen.has(c)) continue; seen.add(c); stack.push(...(typeParents.get(c) ?? [])); }
  return seen;
};
const SLOTS = [['tors', 'Body Armor'], ['helm', 'Helm'], ['shld', 'Shield'], ['glov', 'Gloves'], ['boot', 'Boots'], ['belt', 'Belt'],
  ['ring', 'Ring'], ['amul', 'Amulet'], ['jewl', 'Jewel'], ['scha', 'Charm'], ['mcha', 'Charm'], ['lcha', 'Charm'], ['weap', 'Weapon']];
// the site's type list leaves the throwing types out
const THROWN = { taxe: 'Throwing Axe', tkni: 'Throwing Knife', jave: 'Javelin', ajav: 'Amazon Javelin', thro: 'Throwing Weapon' };
const slotOf = (code) => {
  const base = baseByCode.get(code);
  if (!base) return { slot: 'Other', type: null };
  if (THROWN[base.Type]) return { slot: 'Weapon', type: THROWN[base.Type] };
  const anc = ancestors(base.Type);
  const hit = SLOTS.find(([t]) => anc.has(t));
  return { slot: hit ? hit[1] : 'Other', type: typeName.get(base.Type) ?? base.Type };
};

// ids count rows with an index, skipping the "Expansion" separators - the
// way the parser numbers them, and the way the game stores them. Section
// headers ("Armor", "Rings") and rows the mod emptied keep their id but have
// no code, so they are not spawnable.
const uniques = [];
let id = 0;
for (const row of tsv(buffers['uniqueitems.txt'])) {
  if (!row.index || row.index === 'Expansion') continue;
  const base = baseByCode.get(row.code);
  uniques.push({
    id, key: row.index, name: displayName(row.index), code: row.code,
    base: base?.Name ?? row.code, tier: base?.Tier ?? null, lvl: Number(row.lvl) || 0,
    exalted: row.index.startsWith('E '), spawnable: !!row.code && row.spawnable !== '0' && (spawnableUnique.get(row.index) ?? true), ...slotOf(row.code),
  });
  id++;
}
const sets = [];
id = 0;
for (const row of tsv(buffers['setitems.txt'])) {
  if (!row.index || row.index === 'Expansion') continue;
  const base = baseByCode.get(row.item);
  sets.push({
    id, key: row.index, name: displayName(row.index), set: displayName(row.set), code: row.item,
    base: base?.Name ?? row.item, tier: base?.Tier ?? null, lvl: Number(row.lvl) || 0,
    mythic: row.index.startsWith('M '), spawnable: !!row.item && (spawnableSet.get(row.index) ?? true) && row.spawnable !== '0', ...slotOf(row.item),
  });
  id++;
}
// runewords: the save stores the parser's id (number in the Name plus 25 or
// 26), the chronicle stores the name's string id - both go in.
const runewords = [];
for (const row of tsv(buffers['runes.txt'])) {
  if (!row.Name || row.complete !== '1') continue;
  const number = Number(row.Name.replace(/^Runeword/, ''));
  if (!Number.isFinite(number)) continue;
  const rwId = number > 75 ? number + 25 : number + 26;
  runewords.push({ id: rwId, key: row.Name, name: displayName(row.Name), stringId: strings.get(row.Name)?.id ?? null,
    runes: [1, 2, 3, 4, 5, 6].map((i) => row[`Rune${i}`]).filter(Boolean).map((code) => displayName(code).replace(/ Rune$/, '')) });
}

// The mod's D2RMM option "Moves RotW uniques to the end" inserts the mod's
// own rows before the "Warlock Class Pack" section instead of appending them,
// so every id from there on differs between the two installs. The build has
// one of the two layouts; the other is derived by moving the block, and each
// unique carries both ids.
const vanillaIndex = new Set(tsv(readFileSync(resolve(VANILLA, 'global/excel/uniqueitems.txt'), 'utf8')).map((r) => r.index));
const buildRows = tsv(buffers['uniqueitems.txt']).filter((r) => r.index && r.index !== 'Expansion');
const pushed = buildRows.filter((r) => !vanillaIndex.has(r.index));
const warlockAt = buildRows.findIndex((r) => r.index.startsWith('Warlock Class Pack'));
const pushedFirst = buildRows.findIndex((r) => !vanillaIndex.has(r.index));
const buildIsShifted = warlockAt >= 0 && pushedFirst >= 0 && pushedFirst < warlockAt;
let idsShifted = null;
if (warlockAt >= 0 && pushed.length) {
  const rest = buildRows.filter((r) => vanillaIndex.has(r.index));
  const other = buildIsShifted
    ? [...rest, ...pushed]                                                        // shift off: appended
    : [...rest.slice(0, rest.findIndex((r) => r.index.startsWith('Warlock Class Pack'))), ...pushed, ...rest.slice(rest.findIndex((r) => r.index.startsWith('Warlock Class Pack')))];
  const otherId = new Map(other.map((r, i) => [r.index, i]));
  idsShifted = uniques.map((u) => otherId.get(u.key) ?? u.id);
}
uniques.forEach((u, i) => { u.idOther = idsShifted ? idsShifted[i] : u.id; });

// the runes, for the rune cabinet
const runes = dropcalc.BaseItems.filter((b) => b.IsRune)
  .map((b) => ({ code: b.Code, name: b.Name.replace(/ Rune$/, ''), number: Number(b.Code.slice(1)), lvl: b.Qlvl }))
  .sort((a, b) => a.number - b.number);

// who dropped it: the Chronicle names the source by the string id of the
// monster (or object) name
const sources = {};
for (const file of ['monsters.json', 'objects.json', 'npcs.json']) {
  const p = pick(`local/lng/strings/${file}`);
  for (const e of JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''))) if (typeof e.id === 'number' && e.enUS) sources[e.id] = e.enUS;
}

const out = {
  generatedAt: new Date().toISOString(),
  from: { build: config.generate.from, itemVersion: 0x69, rotwShifted: buildIsShifted },
  constants,
  catalog: { uniques, sets, runewords, runes, sources },
};
const target = resolve(root, 'src/assets/save_constants.json');
writeFileSync(target, JSON.stringify(out));
console.log(`build layout: RotW ${buildIsShifted ? 'shifted (mod rows before the Warlock section)' : 'appended (mod rows at the end)'} · pushed rows ${pushed.length} · sources ${Object.keys(sources).length}`);
console.log(`constants ${(JSON.stringify(constants).length / 1024).toFixed(0)} KB · uniques ${uniques.length} (${uniques.filter((u) => u.exalted).length} exalted) · sets ${sets.length} (${sets.filter((s) => s.mythic).length} mythic) · runewords ${runewords.length} -> ${target}`);
