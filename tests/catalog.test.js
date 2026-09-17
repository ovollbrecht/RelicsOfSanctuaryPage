import { describe, it, expect } from 'vitest';
import { catalog, from } from '@/assets/save_constants.json';

/** The save catalog the Grail keys on: ids are row numbers, both layouts are a bijection. */
describe('the save catalog', () => {
  it('numbers uniques and sets by row without gaps', () => {
    catalog.uniques.forEach((u, i) => expect(u.id).toBe(i));
    catalog.sets.forEach((s, i) => expect(s.id).toBe(i));
  });
  it('pairs every unique with exactly one id in the other layout', () => {
    const other = catalog.uniques.map((u) => u.idOther);
    expect(new Set(other).size).toBe(other.length);
    expect(Math.max(...other)).toBe(other.length - 1);
    expect(typeof from.rotwShifted).toBe('boolean');
  });
  it('knows the vanilla rings by their vanilla rows', () => {
    expect(catalog.uniques[122].name).toBe('The Stone of Jordan');
    expect(catalog.uniques[344].name).toBe('Crown of Ages');
    expect(catalog.uniques.find((u) => u.name === 'Exalted Crushflange').exalted).toBe(true);
  });
  it('gives every runeword its rune names and a string id', () => {
    for (const rw of catalog.runewords) { expect(rw.runes.length).toBeGreaterThan(0); expect(typeof rw.stringId).toBe('number'); }
  });
});
