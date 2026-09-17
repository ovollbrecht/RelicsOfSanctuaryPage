import { describe, it, expect, beforeEach } from 'vitest';
import { absorb, useGrail } from '@/composables/useGrail.js';

/**
 * absorb() folds parsed files into the Grail record. The rules under test:
 * the Chronicle's date and source replace whatever an earlier import wrote,
 * a tick by hand is never touched, an owned item without a date keeps a
 * date it already has, and holdings are replaced per file, not summed.
 */
const catalog = { uniques: [{ id: 0, idOther: 0 }, { id: 1, idOther: 1 }], sets: [], runewords: [] };
const file = (name, { items = [], chronicle = null, kind = 'stash', character = null } = {}) => ({ name, kind, character, items, chronicle, error: null });
const unique = (id, extra = {}) => ({ quality: 7, unique_id: id, type: 'rin', ...extra });

describe('absorb', () => {
  beforeEach(() => { useGrail().reset(); });

  it('lets the Chronicle correct a date an earlier import got wrong', () => {
    const grail = useGrail();
    absorb([file('a.d2i', { chronicle: { uniques: [{ id: 1, source: 7, minute: 100 }], sets: [], runewords: [] } })], catalog, false);
    expect(grail.found.value['u:1']).toMatchObject({ when: new Date(100 * 60000).toISOString(), by: 7 });
    absorb([file('a.d2i', { chronicle: { uniques: [{ id: 1, source: 9, minute: 500 }], sets: [], runewords: [] } })], catalog, false);
    expect(grail.found.value['u:1']).toMatchObject({ when: new Date(500 * 60000).toISOString(), by: 9, source: 'chronicle' });
  });

  it('never overwrites a tick by hand', () => {
    const grail = useGrail();
    grail.setManual('u:1', true);
    absorb([file('a.d2i', { chronicle: { uniques: [{ id: 1, source: 7, minute: 100 }], sets: [], runewords: [] } })], catalog, false);
    expect(grail.found.value['u:1']).toEqual({ source: 'manual', when: null });
  });

  it('keeps a Chronicle date when the item later shows up undated in a character file', () => {
    const grail = useGrail();
    absorb([file('a.d2i', { chronicle: { uniques: [{ id: 0, source: 7, minute: 100 }], sets: [], runewords: [] } })], catalog, false);
    absorb([file('Hara.d2s', { kind: 'character', character: 'Hara', items: [unique(0)] })], catalog, false);
    expect(grail.found.value['u:0'].when).toBe(new Date(100 * 60000).toISOString());
    expect(grail.owned.value.items['u:0']).toBe(1);
  });

  it('replaces a file\'s holdings on re-import instead of adding to them', () => {
    const grail = useGrail();
    absorb([file('a.d2i', { items: [unique(0), unique(0), { type: 'r30', quality: 2 }] })], catalog, false);
    expect(grail.owned.value.items['u:0']).toBe(2);
    expect(grail.owned.value.runes.r30).toBe(1);
    absorb([file('a.d2i', { items: [unique(0)] })], catalog, false);
    expect(grail.owned.value.items['u:0']).toBe(1);
    expect(grail.owned.value.runes.r30).toBeUndefined();
  });

  it('counts a plain base with empty sockets, with its staffmods', () => {
    const grail = useGrail();
    absorb([file('a.d2i', { items: [{ quality: 2, type: 'wsp', socketed: 1, total_nr_of_sockets: 3, level: 60, magic_attributes: [{ name: 'item_singleskill', values: [54, 3] }] }] })], catalog, false);
    expect(grail.bases.value).toEqual([expect.objectContaining({ code: 'wsp', sockets: 3, eth: false, superior: false, ilvl: 60, mods: [{ skill: 54, level: 3 }], count: 1 })]);
  });
});
