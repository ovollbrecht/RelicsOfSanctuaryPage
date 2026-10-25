<script setup>
import { farmPlannerEnabled } from '@/composables/useFarmList.js';
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { t, locale } from '@/i18n';

/**
 * One search over everything the site knows: items, sets, runewords, runes,
 * cube recipes, zones, areas, monsters and the pages themselves. Cmd/Ctrl+K
 * or the button in the sidebar opens it; a pick jumps to the page that owns
 * the thing, with its own search already filled in. The index is built from
 * the data files the first time it opens - none of it loads before that.
 */
const router = useRouter();
const open = ref(false);
const q = ref('');
const active = ref(0);
const input = ref(null);
const index = ref(null);
let building = null;

const PAGES = [
  ['Home', '/'], ['Uniques', '/items/uniques'], ['Sets', '/items/sets'], ['Runewords', '/runewords'], ['Crafting', '/items/crafting'],
  ['Horadric Cube', '/items/cube'], ['Mythic Affixes', '/items/mythic-affixes'], ['Drop Calculator', '/drop-calc'], ['Affix Calculator', '/items/affixes'],
  ['Terror Zones', '/terror-zones'], ...(farmPlannerEnabled ? [['Where to Farm', '/where-to-farm'], ['Tonight', '/tonight']] : []), ['Grail', '/grail'], ['Options', '/options'], ['Changelog', '/changelog'],
];
const KIND_ORDER = ['Page', 'Unique', 'Set', 'Set item', 'Runeword', 'Rune', 'Recipe', 'Zone', 'Area', 'Monster', 'Superunique'];

const build = async () => {
  const [uniques, sets, runewords, cube, tz, drop] = await Promise.all([
    import('@/assets/unique_items.json'), import('@/assets/sets.json'), import('@/assets/runewords.json'),
    import('@/assets/cube.json'), import('@/assets/terror_zones.json'), import('@/assets/dropcalc.json'),
  ].map((p) => p.then((m) => m.default ?? m)));
  const out = [];
  const add = (kind, label, hint, to) => out.push({ kind, label, hint, to, key: label.toLowerCase() });
  for (const [label, path] of PAGES) add('Page', t(label), '', { path });
  for (const u of uniques) add('Unique', u.Name, u.BaseItemName, { path: '/items/uniques', query: { q: u.Name } });
  for (const s of sets) {
    add('Set', s.Name, t('{n} pieces', { n: (s.Items ?? []).length }), { path: '/items/sets', query: { q: s.Name } });
    for (const it of s.Items ?? []) add('Set item', it.Name, s.Name, { path: '/items/sets', query: { q: it.Name } });
  }
  const seenRw = new Set(); const runes = new Map();
  for (const rw of runewords) {
    (rw.RuneNames ?? []).forEach((name, i) => { if (!runes.has(name)) runes.set(name, rw.Runes?.[i]); });
    if (seenRw.has(rw.RowId)) continue;
    seenRw.add(rw.RowId);
    add('Runeword', rw.Name, (rw.RuneNames ?? []).join(' '), { path: '/runewords', query: { q: rw.Name } });
  }
  for (const [name] of runes) add('Rune', t('{name} Rune', { name }), t('runewords using it'), { path: '/runewords', query: { runes: name } });
  for (const r of cube.Recipes ?? []) add('Recipe', r.Title, r.Group ?? r.Category ?? '', { path: '/items/cube', query: { q: r.Title } });
  for (const z of tz.zones ?? []) add('Zone', z.name, t('Act {act} · terror zone', { act: z.act }), { path: '/terror-zones', query: { zone: z.key } });
  for (const a of drop.Areas ?? []) add('Area', a.Name, t('Act {act}', { act: a.Act }), { path: '/drop-calc', query: { area: String(a.Id) } });
  for (const m of drop.Monsters ?? []) add('Monster', m.Name, m.Id, { path: '/drop-calc', query: { monster: m.Id } });
  for (const su of drop.SuperUniques ?? []) add('Superunique', su.Name, drop.Monsters[su.Monster]?.Name ?? '', { path: '/drop-calc', query: { su: su.Id } });
  index.value = out;
};

const results = computed(() => {
  const text = q.value.trim().toLowerCase();
  if (!index.value || text.length < 2) return [];
  const tokens = text.split(/\s+/);
  const scored = [];
  for (const e of index.value) {
    if (!tokens.every((t) => e.key.includes(t))) continue;
    // a hit at the start of the name first, then the shorter name
    const score = (e.key.startsWith(text) ? 0 : e.key.split(/\s+/).some((w) => w.startsWith(tokens[0])) ? 1 : 2) * 1000 + e.key.length;
    scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || KIND_ORDER.indexOf(a.e.kind) - KIND_ORDER.indexOf(b.e.kind));
  // at most a handful per kind, so one kind cannot crowd out the rest
  const perKind = {}; const out = [];
  for (const { e } of scored) {
    if ((perKind[e.kind] ?? 0) >= 6) continue;
    perKind[e.kind] = (perKind[e.kind] ?? 0) + 1;
    out.push(e);
    if (out.length >= 30) break;
  }
  return out;
});
watch(results, () => { active.value = 0; });
// the page names and hints are built in one language - a switch throws the index away
watch(locale, () => { index.value = null; building = null; });

const show = async () => {
  open.value = true;
  building ??= build();
  await nextTick();
  input.value?.focus();
  input.value?.select();
};
const hide = () => { open.value = false; };
const go = (entry) => { if (!entry) return; hide(); router.push(entry.to); };
const onKey = (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); open.value ? hide() : show(); return; }
  if (!open.value) {
    const typing = /^(input|textarea|select)$/i.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    if (e.key === '/' && !typing && !mod) { e.preventDefault(); show(); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); hide(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); active.value = Math.min(results.value.length - 1, active.value + 1); scrollActive(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); active.value = Math.max(0, active.value - 1); scrollActive(); }
  else if (e.key === 'Enter') { e.preventDefault(); go(results.value[active.value]); }
};
const scrollActive = () => nextTick(() => document.querySelector('.gs-item.active')?.scrollIntoView({ block: 'nearest' }));
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="gs-backdrop" @mousedown.self="hide">
      <div class="gs-box" role="dialog" :aria-label="$t('Search the site')">
        <input ref="input" v-model="q" class="gs-input" type="text" :placeholder="$t('Search items, runewords, recipes, zones, monsters…')" autocomplete="off" spellcheck="false" />
        <div v-if="!index" class="gs-hint">{{ $t('Loading the index…') }}</div>
        <div v-else-if="q.trim().length < 2" class="gs-hint">{{ $t('Type two letters. ↑↓ to move, Enter to open, Esc to close.') }}</div>
        <div v-else-if="results.length === 0" class="gs-hint">{{ $t('Nothing called "{q}".', { q: q.trim() }) }}</div>
        <ul v-else class="gs-list">
          <li v-for="(r, i) in results" :key="r.kind + r.label + r.hint" class="gs-item" :class="{ active: i === active }" @mouseenter="active = i" @mousedown.prevent="go(r)">
            <span class="gs-kind" :class="'k-' + r.kind.toLowerCase().replace(' ', '-')">{{ $t(r.kind) }}</span>
            <span class="gs-label">{{ r.label }}</span>
            <span v-if="r.hint" class="gs-sub">{{ r.hint }}</span>
          </li>
        </ul>
        <div class="gs-foot">{{ $t('{key} or / opens this anywhere', { key: isMac ? '⌘K' : 'Ctrl+K' }) }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gs-backdrop { position: fixed; inset: 0; z-index: 2000; background: rgba(5, 4, 3, 0.7); display: flex; justify-content: center; align-items: flex-start; padding: 10vh 1rem 1rem; }
.gs-box { width: min(640px, 100%); background: var(--d2r-panel, #1a1410); border: 1px solid rgba(201, 163, 106, 0.45); border-radius: 0.5rem; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7); overflow: hidden; }
.gs-input { width: 100%; padding: 0.85rem 1rem; font-size: 1.05rem; background: rgba(0, 0, 0, 0.35); color: var(--d2r-text, #e8dcc6); border: 0; border-bottom: 1px solid rgba(201, 163, 106, 0.25); outline: none; }
.gs-input::placeholder { color: rgba(232, 220, 198, 0.4); }
.gs-hint, .gs-foot { padding: 0.6rem 1rem; font-size: 0.85rem; color: var(--d2r-muted, #a89b85); }
.gs-foot { border-top: 1px solid rgba(201, 163, 106, 0.15); font-size: 0.75rem; }
.gs-list { list-style: none; margin: 0; padding: 0.25rem 0; max-height: 60vh; overflow-y: auto; }
.gs-item { display: flex; align-items: baseline; gap: 0.6rem; padding: 0.4rem 1rem; cursor: pointer; }
.gs-item.active { background: rgba(201, 163, 106, 0.14); }
.gs-kind { flex: none; width: 5.6rem; font-size: 0.68rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--d2r-muted, #a89b85); }
.gs-kind.k-unique { color: #c7b377; }
.gs-kind.k-set, .gs-kind.k-set-item { color: #7fdc7f; }
.gs-kind.k-runeword, .gs-kind.k-rune { color: #e0b85a; }
.gs-kind.k-zone, .gs-kind.k-area { color: #9fb8d8; }
.gs-kind.k-monster, .gs-kind.k-superunique { color: #d89a8a; }
.gs-label { color: var(--d2r-text, #e8dcc6); }
.gs-sub { font-size: 0.8rem; color: var(--d2r-muted, #a89b85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
