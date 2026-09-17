import { describe, it, expect } from 'vitest';
import data from '@/assets/dropcalc.json';
import { catalog } from '@/assets/save_constants.json';
import { buildContext, setPool } from '@/composables/useDropSimulation.js';
import { DEFAULT_PROFILE, resolveTargets, targetToken, grailTargets, buildSpots, applyPreset, scoreSpot } from '@/composables/useFarmPlanner.js';
import { farmToken } from '@/composables/useFarmList.js';

const ctx = buildContext(data, { dataMode: 'mod', players: 1, partyNearby: 1, mf: 0, terror: { enabled: false, charLevel: 99 }, exalted: { enabled: true, percent: 5 }, mythic: { enabled: true, percent: 5 }, heraldTier: 1 });
const spots = buildSpots(data, 2);
const durance = spots.find((s) => s.name === 'Durance of Hate Level 3');
const score = (targets, spot = durance) => scoreSpot(ctx, applyPreset(data, spot, null), targets, DEFAULT_PROFILE, 2, { highRune: 25, detail: true });
const hitOf = (s, k) => s.detail.targets.find((t) => t.k === k)?.hit ?? 0;

describe('targets and tokens', () => {
  it('names an item by kind and name, the variant with an x', () => {
    expect(farmToken('unique', 'Shako')).toBe('u:Shako');
    expect(farmToken('set', 'Tal Rasha\'s Horadric Crest', true)).toBe('sx:Tal Rasha\'s Horadric Crest');
  });
  it('resolves a plain token to every spawnable row of that name and round-trips', () => {
    const [facet] = resolveTargets(data, ['u:Rainbow Facet']);
    expect(facet.rows.length).toBeGreaterThan(1);
    expect(targetToken(facet)).toBe('u:Rainbow Facet');
    const [exalted] = resolveTargets(data, ['ux:Exalted Harlequin Crest']);
    expect(exalted).toMatchObject({ kind: 'unique', variant: 'exalted', name: 'Exalted Harlequin Crest' });
    expect(targetToken(exalted)).toBe('ux:Exalted Harlequin Crest');
  });
  it('drops tokens nothing matches', () => {
    expect(resolveTargets(data, ['u:No Such Thing', 'x:Nonsense'])).toEqual([]);
  });
});

describe('the Grail as targets', () => {
  it('turns every missing spawnable row into one target, plain or variant', () => {
    const all = grailTargets(data, catalog, {});
    const spawnable = catalog.uniques.filter((u) => u.spawnable).length + catalog.sets.filter((s) => s.spawnable).length;
    expect(all.length).toBeGreaterThan(spawnable - 20); // a handful of rows have no drop source
    expect(new Set(all.map((t) => t.variant))).toEqual(new Set(['base', 'exalted', 'mythic']));
    const found = Object.fromEntries(catalog.uniques.slice(0, 50).map((u) => [`u:${u.id}`, 1]));
    expect(grailTargets(data, catalog, found).length).toBeLessThan(all.length);
  });
});

describe('scoring', () => {
  it('splits the plain roll into base and exalted, five percent to the variant', () => {
    const [plain] = resolveTargets(data, ['u:Harlequin Crest']);
    const base = { ...plain, variant: 'base' };
    const exalted = { ...plain, variant: 'exalted', name: 'Exalted Harlequin Crest' };
    const s = score([plain, base, exalted]);
    const [p, b, e] = [hitOf(s, 0), hitOf(s, 1), hitOf(s, 2)];
    expect(p).toBeGreaterThan(0);
    expect(e / p).toBeCloseTo(0.05, 3);
    // per-run chances combine as 1 - (1-a)(1-b), so base and exalted together give the plain roll
    expect(1 - (1 - b) * (1 - e)).toBeCloseTo(p, 6);
  });
  it('lists a per-run chance for every target that can drop, best first', () => {
    const targets = resolveTargets(data, ['u:Harlequin Crest', 'u:Windforce', 's:Tal Rasha\'s Guardianship']);
    const s = score(targets);
    expect(s.detail.targets.map((t) => t.hit)).toEqual([...s.detail.targets.map((t) => t.hit)].sort((a, b) => b - a));
    expect(s.perRun).toBeGreaterThan(0);
    expect(s.perRun).toBeLessThanOrEqual(1);
  });
  it('gives the Cow King\'s Leathers to the Cow King alone', () => {
    const hide = data.Sets.find((s) => s.Name === "Cow King's Hide");
    const names = (pool) => pool.map((p) => p.entry.Name);
    expect(names(setPool(ctx, hide.Base, 99, data.Monsters.find((m) => m.Id === 'mephisto')))).not.toContain("Cow King's Hide");
    expect(names(setPool(ctx, hide.Base, 99, null))).not.toContain("Cow King's Hide");
    expect(names(setPool(ctx, hide.Base, 99, data.Monsters.find((m) => m.Id === 'cowking')))).toContain("Cow King's Hide");
    const [target] = resolveTargets(data, ["s:Cow King's Hide"]);
    expect(hitOf(score([target]), 0)).toBe(0);
    const cows = spots.find((s) => /Cow Level/.test(s.name));
    expect(hitOf(score([target], cows), 0)).toBeGreaterThan(0);
  });
});
