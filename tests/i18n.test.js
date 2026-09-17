import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, locale, setLocale } from '@/i18n';

/**
 * The German dictionary is only as good as its coverage: every literal key
 * the source passes to t() or $t() must have an entry, and no two
 * dictionaries may translate the same key differently, since they are merged
 * into one and the last one loaded would silently win.
 */
const root = new URL('../src/', import.meta.url).pathname;
const walk = (dir, out = []) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(vue|js)$/.test(name)) out.push(p); } return out; };
const dictionaries = readdirSync(join(root, 'i18n/de')).map((f) => [f, JSON.parse(readFileSync(join(root, 'i18n/de', f), 'utf8'))]);
const merged = Object.assign({}, ...dictionaries.map(([, d]) => d));
const KEY = /\$?\bt\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;

describe('the German dictionary', () => {
  it('has an entry for every literal key in the source', () => {
    const missing = [];
    for (const file of walk(root)) {
      const s = readFileSync(file, 'utf8');
      for (const m of s.matchAll(KEY)) {
        const key = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
        if (!(key in merged)) missing.push(`${key}  <- ${file.replace(root, '')}`);
      }
    }
    expect(missing).toEqual([]);
  });
  it('never translates one key two ways', () => {
    const seen = new Map();
    const conflicts = [];
    for (const [file, d] of dictionaries) for (const [k, v] of Object.entries(d)) {
      if (seen.has(k) && seen.get(k).v !== v) conflicts.push(`${k}: ${seen.get(k).file} "${seen.get(k).v}" vs ${file} "${v}"`);
      seen.set(k, { v, file });
    }
    expect(conflicts).toEqual([]);
  });
  it('keeps placeholders intact', () => {
    const broken = Object.entries(merged).filter(([k, v]) => {
      const want = [...k.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const have = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      return want.join() !== have.join();
    }).map(([k]) => k);
    expect(broken).toEqual([]);
  });
});

describe('t()', () => {
  it('falls back to the English key and fills placeholders', () => {
    setLocale('en');
    expect(t('Not a key anyone wrote')).toBe('Not a key anyone wrote');
    expect(t('{n} of {total} craftable', { n: 3, total: 145 })).toBe('3 of 145 craftable');
  });
  it('switches to German and strips a context after the bar', () => {
    setLocale('de');
    expect(locale.value).toBe('de');
    expect(t('Runewords')).toBe('Runenwörter');
    expect(t('Magic|quality')).toBe('Magisch');
    expect(t('Magic')).toBe('Magie');
    setLocale('en');
    expect(t('Magic|quality')).toBe('Magic');
  });
});
