import { ref, computed, watch } from 'vue';

/**
 * The Grail: what has been found, read out of the game's own save files.
 *
 * Three sources feed one record per item. The shared stash and the characters
 * say what is owned right now; the Chronicle section of the shared stash says
 * what was ever found since it was last reset, with the minute it happened;
 * and a tick by hand covers everything older. The record keeps the earliest
 * source and date it saw, and a manual tick never gets overwritten by an
 * import.
 *
 * Everything runs in the browser. The files are read into memory, parsed, and
 * forgotten - nothing leaves the machine.
 */
const KEY = 'grail_state';

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object' && saved.found) return saved;
  } catch { /* fresh */ }
  return { found: {}, imports: [], holdings: {} };
};
const state = ref(load());
watch(state, (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no storage */ } }, { deep: true });

// Whether the player's install has "Moves RotW uniques to the end" on. It
// changes the row ids of every unique from the Warlock section on, so the
// import has to know which of the two layouts wrote the save.
const ROTW_KEY = 'grail_rotw_shift';
const rotwShift = ref((() => { try { return localStorage.getItem(ROTW_KEY) === '1'; } catch { return false; } })());
watch(rotwShift, (v) => { try { localStorage.setItem(ROTW_KEY, v ? '1' : '0'); } catch { /* fine */ } });

let parserPromise = null;
const loadParser = () => {
  parserPromise ??= Promise.all([import('@/vendor/d2s.js'), import('@/assets/save_constants.json')]).then(([d2s, data]) => {
    const payload = data.default ?? data;
    d2s.setConstantData(payload.from.itemVersion, payload.constants);
    return { d2s, payload };
  });
  return parserPromise;
};

/**
 * The Chronicle section: a header with three counts - set items, uniques,
 * runewords - then ten bytes per entry: a source (u16), the minute it happened
 * (u32, minutes since 1970) and the id (u32). Set items and uniques are row
 * ids of their tables, runewords the string id of their name.
 */
export function decodeChronicle(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0xc0eaedc0) return null;
  const counts = [view.getUint16(6, true), view.getUint16(8, true), view.getUint16(10, true)];
  let pos = 24;
  const read = (count) => {
    const list = [];
    for (let i = 0; i < count && pos + 10 <= bytes.length; i++) {
      list.push({ source: view.getUint16(pos, true), minute: view.getUint32(pos + 2, true), id: view.getUint32(pos + 6, true) });
      pos += 10;
    }
    return list;
  };
  return { sets: read(counts[0]), uniques: read(counts[1]), runewords: read(counts[2]) };
}

const walkItems = (items, out, socketed = false) => {
  for (const item of items ?? []) {
    if (socketed) item.inSocket = true;
    out.push(item);
    if (item.socketed_items?.length) walkItems(item.socketed_items, out, true);
  }
};

/**
 * Reads one file - a shared stash (.d2i) or a character (.d2s) - and returns
 * what it holds: owned uniques/sets/runewords by id and the Chronicle where
 * the file has one.
 */
export async function readSaveFile(file) {
  const { d2s } = await loadParser();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name;
  const result = { name, kind: null, items: [], chronicle: null, error: null };
  try {
    if (/\.d2i$/i.test(name)) {
      result.kind = 'stash';
      const stash = await d2s.stash.read(bytes, null, /^Modern/i.test(name) ? 3 : 2);
      for (const page of stash.pages) walkItems(page.items, result.items);
      if (stash.chronicle) result.chronicle = decodeChronicle(stash.chronicle);
    } else if (/\.d2s$/i.test(name)) {
      result.kind = 'character';
      const character = await d2s.read(bytes);
      walkItems(character.items, result.items);
      walkItems(character.merc_items, result.items);
      walkItems(character.corpse_items, result.items);
      result.character = character.header?.name ?? name.replace(/\.d2s$/i, '');
    } else {
      result.error = 'not a save file';
    }
  } catch (error) {
    result.error = String(error?.message ?? error).split('\n')[0].slice(0, 200);
  }
  return result;
}

const minuteToIso = (minute) => new Date(minute * 60000).toISOString();

/**
 * Folds parsed files into the record. Returns what the import added.
 *
 * Unique ids are translated into the catalog's own numbering when the save
 * was written by the other row layout (see rotwShift); set and runeword ids
 * are the same in both.
 *
 * Besides the Grail record, each file leaves a snapshot of what it holds -
 * how many copies of each item, and the loose runes - under its name, so a
 * later import of the same file replaces it instead of adding to it.
 */
export function absorb(results, catalog, buildShifted) {
  const found = { ...state.value.found };
  const holdings = { ...(state.value.holdings ?? {}) };
  const now = new Date().toISOString();
  let added = 0;
  const translate = rotwShift.value !== !!buildShifted && catalog
    ? new Map(catalog.uniques.map((u) => [u.idOther, u.id]))
    : null;
  const uniqueKey = (id) => `u:${translate ? (translate.get(id) ?? id) : id}`;
  const note = (key, source, when, by, who) => {
    const prev = found[key];
    const extra = { ...(by ? { by } : {}), ...(who ? { who } : {}) };
    if (!prev) { found[key] = { source, when: when ?? null, ...extra }; added++; return; }
    if (prev.source === 'manual') return;
    // keep the earliest date we know of
    if (when && (!prev.when || when < prev.when)) found[key] = { ...prev, when, source, ...extra };
  };
  for (const r of results) {
    if (r.error) continue;
    const held = { kind: r.kind, character: r.character ?? null, at: now, items: {}, runes: {} };
    const count = (key) => { held.items[key] = (held.items[key] ?? 0) + 1; };
    for (const item of r.items) {
      let key = null;
      if (item.quality === 7 && item.unique_id != null && item.unique_id < 4095) key = uniqueKey(item.unique_id);
      else if (item.quality === 5 && item.set_id != null) key = `s:${item.set_id}`;
      if (key) { note(key, r.kind, null, null, r.character); count(key); }
      if (item.given_runeword && item.runeword_id != null) { note(`r:${item.runeword_id}`, r.kind, null, null, r.character); count(`r:${item.runeword_id}`); }
      if (!item.inSocket && /^r[0-3]\d$/.test(item.type ?? '')) held.runes[item.type] = (held.runes[item.type] ?? 0) + 1;
    }
    if (r.chronicle) {
      for (const e of r.chronicle.uniques) if (e.id < 4095) note(uniqueKey(e.id), 'chronicle', minuteToIso(e.minute), e.source || null);
      for (const e of r.chronicle.sets) note(`s:${e.id}`, 'chronicle', minuteToIso(e.minute), e.source || null);
      for (const e of r.chronicle.runewords) note(`rs:${e.id}`, 'chronicle', minuteToIso(e.minute), null);
    }
    holdings[r.name] = held;
  }
  state.value = {
    ...state.value,
    found,
    holdings,
    imports: [...(state.value.imports ?? []), { at: now, files: results.filter((r) => !r.error).map((r) => r.name), added }].slice(-10),
  };
  return added;
}

export function useGrail() {
  const found = computed(() => state.value.found);
  const has = (key) => !!state.value.found[key];
  const setManual = (key, on) => {
    const next = { ...state.value.found };
    if (on) next[key] = { source: 'manual', when: null };
    else delete next[key];
    state.value = { ...state.value, found: next };
  };
  const reset = () => { state.value = { found: {}, imports: [], holdings: {} }; };
  const exportState = () => JSON.stringify(state.value);
  const importState = (json) => {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.found) throw new Error('not a grail file');
    state.value = { found: parsed.found, imports: parsed.imports ?? [], holdings: parsed.holdings ?? {} };
  };
  // what the files hold right now, summed over all of them
  const holdings = computed(() => state.value.holdings ?? {});
  const owned = computed(() => {
    const items = {}; const runes = {};
    for (const h of Object.values(holdings.value)) {
      for (const [k, n] of Object.entries(h.items ?? {})) items[k] = (items[k] ?? 0) + n;
      for (const [k, n] of Object.entries(h.runes ?? {})) runes[k] = (runes[k] ?? 0) + n;
    }
    return { items, runes };
  });
  const forgetHolding = (name) => { const next = { ...holdings.value }; delete next[name]; state.value = { ...state.value, holdings: next }; };
  return { state, found, has, setManual, reset, exportState, importState, loadParser, rotwShift, holdings, owned, forgetHolding };
}
