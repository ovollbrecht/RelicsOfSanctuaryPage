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
  return { found: {}, imports: [] };
};
const state = ref(load());
watch(state, (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no storage */ } }, { deep: true });

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

const walkItems = (items, out) => {
  for (const item of items ?? []) {
    out.push(item);
    if (item.socketed_items?.length) walkItems(item.socketed_items, out);
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
 */
export function absorb(results) {
  const found = { ...state.value.found };
  const now = new Date().toISOString();
  let added = 0;
  const note = (key, source, when) => {
    const prev = found[key];
    if (!prev) { found[key] = { source, when: when ?? null }; added++; return; }
    if (prev.source === 'manual') return;
    // keep the earliest date we know of
    if (when && (!prev.when || when < prev.when)) found[key] = { ...prev, when, source };
  };
  for (const r of results) {
    if (r.error) continue;
    for (const item of r.items) {
      if (item.quality === 7 && item.unique_id != null && item.unique_id < 4095) note(`u:${item.unique_id}`, r.kind, null);
      else if (item.quality === 5 && item.set_id != null) note(`s:${item.set_id}`, r.kind, null);
      if (item.given_runeword && item.runeword_id != null) note(`r:${item.runeword_id}`, r.kind, null);
    }
    if (r.chronicle) {
      for (const e of r.chronicle.uniques) if (e.id < 4095) note(`u:${e.id}`, 'chronicle', minuteToIso(e.minute));
      for (const e of r.chronicle.sets) note(`s:${e.id}`, 'chronicle', minuteToIso(e.minute));
      for (const e of r.chronicle.runewords) note(`rs:${e.id}`, 'chronicle', minuteToIso(e.minute));
    }
  }
  state.value = {
    found,
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
  const reset = () => { state.value = { found: {}, imports: [] }; };
  const exportState = () => JSON.stringify(state.value);
  const importState = (json) => {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.found) throw new Error('not a grail file');
    state.value = { found: parsed.found, imports: parsed.imports ?? [] };
  };
  return { state, found, has, setManual, reset, exportState, importState, loadParser };
}
