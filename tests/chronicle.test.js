import { describe, it, expect } from 'vitest';
import { decodeChronicle } from '@/composables/useGrail.js';

/**
 * The Chronicle section as the game writes it: a 20-byte header (magic,
 * version, three u16 counts, padding) and ten bytes per entry - id u32,
 * source u16, minute u32. The nine pairs below were read off the in-game
 * Chronicle panel and matched the stash file to the minute; an earlier
 * decoder had the id last and paired every date with the next item.
 */
const MINUTE = (iso) => Math.floor(Date.parse(iso) / 60000);
const KNOWN = [
  // [kind, id, source string id, minute, note]
  ['unique', 122, 3139, MINUTE('2026-09-14T18:26Z'), 'The Stone of Jordan · Council Member'],
  ['unique', 344, 3139, MINUTE('2026-09-14T18:23Z'), 'Crown of Ages · Council Member'],
  ['unique', 22, 3062, MINUTE('2026-08-23T16:13Z'), 'Ironstone · Mephisto'],
  ['unique', 460, 3139, MINUTE('2026-09-06T22:07Z'), 'Exalted Ironstone · Council Member'],
  ['unique', 307, 3064, MINUTE('2026-08-23T20:11Z'), 'Stone Crusher · Horror'],
  ['unique', 316, 3054, MINUTE('2026-08-30T19:37Z'), 'Stoneraven · Duriel'],
  ['unique', 206, 3054, MINUTE('2026-08-31T00:16Z'), 'Crown of Thieves · Duriel'],
  ['unique', 202, 3062, MINUTE('2026-08-22T23:57Z'), 'Peasant Crown · Mephisto'],
  ['unique', 77, 3021, MINUTE('2026-09-14T20:58Z'), 'Undead Crown · Andariel'],
];

function encode({ sets = [], uniques = [], runewords = [] }) {
  const entries = [...sets, ...uniques, ...runewords];
  const bytes = new Uint8Array(20 + entries.length * 10 + 64); // the game pads the tail with zeros
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xc0eaedc0, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, sets.length, true);
  view.setUint16(8, uniques.length, true);
  view.setUint16(10, runewords.length, true);
  let pos = 20;
  for (const [, id, source, minute] of entries) {
    view.setUint32(pos, id, true); view.setUint16(pos + 4, source, true); view.setUint32(pos + 6, minute, true);
    pos += 10;
  }
  return bytes;
}

describe('decodeChronicle', () => {
  it('reads id, source and minute of every entry and keeps the three lists apart', () => {
    const sets = [['set', 187, 3054, MINUTE('2026-09-14T21:06Z'), "Mythic Berserker's Hatchet · Duriel"]];
    const runewords = [['rw', 42000, 0, MINUTE('2026-09-14T20:19Z'), 'Isendras Legacy']];
    const out = decodeChronicle(encode({ sets, uniques: KNOWN, runewords }));
    expect(out.sets).toEqual([{ id: 187, source: 3054, minute: sets[0][3] }]);
    expect(out.runewords).toEqual([{ id: 42000, source: 0, minute: runewords[0][3] }]);
    expect(out.uniques).toHaveLength(KNOWN.length);
    for (const [, id, source, minute] of KNOWN) expect(out.uniques).toContainEqual({ id, source, minute });
  });

  it('pairs each date with its own item, not the next one', () => {
    const out = decodeChronicle(encode({ uniques: KNOWN }));
    const soj = out.uniques.find((e) => e.id === 122);
    const crown = out.uniques.find((e) => e.id === 344);
    expect(new Date(soj.minute * 60000).toISOString()).toBe('2026-09-14T18:26:00.000Z');
    expect(crown.minute).toBe(soj.minute - 3);
  });

  it('rejects anything that does not start with the magic', () => {
    expect(decodeChronicle(new Uint8Array(40))).toBeNull();
    expect(decodeChronicle(null)).toBeNull();
  });

  it('stops at the end of the buffer instead of reading past it', () => {
    const bytes = encode({ uniques: KNOWN }).slice(0, 20 + 3 * 10 + 4);
    expect(decodeChronicle(bytes).uniques).toHaveLength(3);
  });
});
