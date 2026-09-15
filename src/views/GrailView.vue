<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { t } from '@/i18n';
import { useGrail, readSaveFile, absorb } from '@/composables/useGrail.js';
import { useFarmList, farmToken } from '@/composables/useFarmList.js';
import GrailOverview from '@/components/grail/GrailOverview.vue';
import RuneCabinet from '@/components/grail/RuneCabinet.vue';
import GrailMilestones from '@/components/grail/GrailMilestones.vue';
import GrailRarity from '@/components/grail/GrailRarity.vue';
import GrailTimeline from '@/components/grail/GrailTimeline.vue';
import { drawGrailCard } from '@/composables/useGrailCard.js';

/**
 * The Grail page: the checklist of everything there is to find, ticked off
 * from the game's own save files. Drop the shared stash and the characters on
 * it - they are parsed here in the browser and never uploaded - and the
 * Chronicle inside the stash adds what was found and since gone.
 */
const grail = useGrail();
const farmList = useFarmList();

const catalog = ref(null);
const buildShifted = ref(false);
const loadError = ref(null);
onMounted(async () => {
  try {
    const { payload } = await grail.loadParser();
    catalog.value = payload.catalog;
    buildShifted.value = !!payload.from?.rotwShifted;
  } catch (e) {
    loadError.value = String(e?.message ?? e);
  }
});

// ---------- import ----------
const busy = ref(false);
const lastImport = ref(null); // { files: [{ name, kind, items, error }], added }
const dragging = ref(false);
const importOpen = ref(false);
const isSave = (f) => /\.(d2i|d2s)$/i.test(f.name);
const importFiles = async (fileList) => {
  const files = [...fileList].filter(isSave);
  if (files.length === 0) { lastImport.value = { files: [], added: 0, nothing: true }; return; }
  busy.value = true;
  try {
    const results = [];
    for (const f of files) results.push(await readSaveFile(f));
    const added = absorb(results, catalog.value, buildShifted.value);
    lastImport.value = { files: results.map((r) => ({ name: r.name, kind: r.kind, items: r.items.length, chronicle: !!r.chronicle, error: r.error })), added };
  } finally {
    busy.value = false;
  }
};
const onDrop = (e) => { dragging.value = false; if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files); };
const onPick = (e) => { if (e.target.files?.length) importFiles(e.target.files); e.target.value = ''; };

// ---------- backup ----------
const exportGrail = () => {
  const blob = new Blob([grail.exportState()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `relics-grail-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const restoreError = ref(null);
const restoreGrail = async (e) => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  try { grail.importState(await f.text()); restoreError.value = null; } catch (err) { restoreError.value = String(err?.message ?? err); }
};
const confirmReset = ref(false);
const doReset = () => { grail.reset(); confirmReset.value = false; lastImport.value = null; };

// ---------- the lists ----------
const TABS = [
  { id: 'uniques', label: 'Uniques' }, { id: 'exalted', label: 'Exalted' },
  { id: 'sets', label: 'Sets' }, { id: 'mythic', label: 'Mythic' }, { id: 'runewords', label: 'Runewords' },
];
const tab = ref('uniques');
const route = useRoute();
const query = ref(typeof route.query.q === 'string' ? route.query.q : '');
const show = ref('all'); // all | missing | found | spares
const tiers = ref(new Set()); // empty = every tier
const slot = ref('');
const sort = ref('default'); // default | name | lvl | date
const groupBySet = ref(true);
const TIER = ['Normal', 'Exceptional', 'Elite'];

const keysOf = (entry) => (entry.kind === 'runeword' ? [`r:${entry.id}`, ...(entry.stringId != null ? [`rs:${entry.stringId}`] : [])] : [`${entry.kind === 'set' ? 's' : 'u'}:${entry.id}`]);
const recordOf = (entry) => { for (const k of keysOf(entry)) { const r = grail.found.value[k]; if (r) return r; } return null; };
const isFound = (entry) => recordOf(entry) != null;
const ownedOf = (entry) => { let n = 0; for (const k of keysOf(entry)) n += grail.owned.value.items[k] ?? 0; return n; };

const entries = computed(() => {
  if (!catalog.value) return { uniques: [], exalted: [], sets: [], mythic: [], runewords: [] };
  const u = catalog.value.uniques.filter((x) => x.spawnable).map((x) => ({ ...x, kind: 'unique' }));
  const s = catalog.value.sets.filter((x) => x.spawnable).map((x) => ({ ...x, kind: 'set' }));
  return {
    uniques: u.filter((x) => !x.exalted).map((x) => ({ ...x, tabId: 'uniques' })),
    exalted: u.filter((x) => x.exalted).map((x) => ({ ...x, tabId: 'exalted' })),
    sets: s.filter((x) => !x.mythic).map((x) => ({ ...x, tabId: 'sets' })),
    mythic: s.filter((x) => x.mythic).map((x) => ({ ...x, tabId: 'mythic' })),
    runewords: catalog.value.runewords.map((x) => ({ ...x, kind: 'runeword', tabId: 'runewords' })),
  };
});
// every entry with its record, for the overview and the cabinet
const allEntries = computed(() => TABS.flatMap((t) => entries.value[t.id].map((e) => ({ ...e, record: recordOf(e) }))));
const progress = computed(() => Object.fromEntries(TABS.map((t) => {
  const list = entries.value[t.id];
  const found = list.filter(isFound).length;
  return [t.id, { found, total: list.length, pct: list.length ? Math.round((found / list.length) * 100) : 0 }];
})));
const tierProgress = computed(() => [0, 1, 2].map((tier) => {
  const list = entries.value[tab.value].filter((e) => e.tier === tier);
  return { tier, label: TIER[tier], found: list.filter(isFound).length, total: list.length };
}).filter((t) => t.total > 0));
const slotsInTab = computed(() => [...new Set(entries.value[tab.value].map((e) => e.slot).filter(Boolean))].sort());
const isSetTab = computed(() => tab.value === 'sets' || tab.value === 'mythic');
const RECENT_MS = 7 * 86400000;
const isRecent = (entry) => { const r = recordOf(entry); return !!r?.when && Date.now() - new Date(r.when) < RECENT_MS; };

const defaultOrder = (a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.set ?? '').localeCompare(b.set ?? '') || a.lvl - b.lvl || a.name.localeCompare(b.name);
const dateOf = (e) => recordOf(e)?.when ?? '';
const SORTS = {
  default: defaultOrder,
  name: (a, b) => a.name.localeCompare(b.name),
  lvl: (a, b) => (b.lvl ?? 0) - (a.lvl ?? 0) || a.name.localeCompare(b.name),
  date: (a, b) => (dateOf(b) > dateOf(a) ? 1 : dateOf(b) < dateOf(a) ? -1 : defaultOrder(a, b)),
};
const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = entries.value[tab.value];
  if (show.value === 'missing') list = list.filter((e) => !isFound(e));
  if (show.value === 'found') list = list.filter((e) => isFound(e));
  if (show.value === 'spares') list = list.filter((e) => ownedOf(e) > 1);
  if (tiers.value.size) list = list.filter((e) => tiers.value.has(e.tier));
  if (slot.value) list = list.filter((e) => e.slot === slot.value);
  if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || (e.base ?? '').toLowerCase().includes(q) || (e.set ?? '').toLowerCase().includes(q) || (e.runes ?? []).some((r) => r.toLowerCase() === q));
  return [...list].sort(SORTS[sort.value] ?? defaultOrder);
});
// the sets tabs, grouped: one section per set with its own tally
const grouped = computed(() => {
  if (!isSetTab.value || !groupBySet.value || sort.value !== 'default') return null;
  const all = entries.value[tab.value];
  const sections = new Map();
  for (const e of visible.value) {
    const sec = sections.get(e.set) ?? { set: e.set, items: [], found: 0, total: all.filter((x) => x.set === e.set).length };
    sec.items.push(e);
    sections.set(e.set, sec);
  }
  for (const sec of sections.values()) sec.found = all.filter((x) => x.set === sec.set && isFound(x)).length;
  return [...sections.values()].sort((a, b) => (a.items[0].tier ?? 0) - (b.items[0].tier ?? 0) || a.set.localeCompare(b.set));
});
const setsComplete = computed(() => {
  if (!isSetTab.value) return null;
  const all = entries.value[tab.value];
  const names = [...new Set(all.map((e) => e.set))];
  const complete = names.filter((n) => all.filter((e) => e.set === n).every(isFound)).length;
  return { complete, total: names.length };
});
const toggleTier = (t) => { const next = new Set(tiers.value); if (next.has(t)) next.delete(t); else next.add(t); tiers.value = next; };
const clearFilters = () => { query.value = ''; show.value = 'all'; tiers.value = new Set(); slot.value = ''; sort.value = 'default'; };
const filtersActive = computed(() => query.value || show.value !== 'all' || tiers.value.size || slot.value || sort.value !== 'default');
watch(tab, () => { slot.value = ''; tiers.value = new Set(); if (show.value === 'spares' && tab.value === 'runewords') show.value = 'all'; });

const toggle = (entry) => grail.setManual(keysOf(entry)[0], !isFound(entry));
const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// where the item sits right now, from the files' holdings: "stash", "on Hara"
const locationsOf = (entry) => {
  const keys = keysOf(entry);
  const out = new Set();
  for (const [file, h] of Object.entries(grail.holdings.value)) {
    if (keys.some((k) => (h.items?.[k] ?? 0) > 0)) out.add(h.kind === 'character' ? t('on {name}', { name: h.character ?? file.replace(/\.d2s$/i, '') }) : t('stash'));
  }
  return [...out];
};
// the places first, the Chronicle's word - who dropped it, when - always last
const sourceText = (entry) => {
  const r = recordOf(entry);
  if (!r) return '';
  const parts = locationsOf(entry);
  if (r.source === 'manual') parts.push(t('ticked by hand'));
  if (r.when) {
    const by = r.by && catalog.value?.sources?.[r.by] ? ` · ${catalog.value.sources[r.by]}` : '';
    parts.push(`${t('Chronicle')}${by} · ${dateFmt.format(new Date(r.when))}`);
  } else if (parts.length === 0) {
    parts.push({ chronicle: t('Chronicle'), stash: t('stash'), character: r.who ? t('on {name}', { name: r.who }) : t('character') }[r.source] ?? r.source);
  }
  return parts.join(' · ');
};
const itemLink = (entry) => (entry.kind === 'runeword'
  ? { path: '/runewords', query: { q: entry.name } }
  : { path: '/drop-calc', query: { mode: 'item', itemkind: entry.kind, item: entry.key } });

// a missing item's name is what the farm list wants; an Exalted or Mythic row
// asks for that roll alone
const farmTokenOf = (entry) => farmToken(entry.kind, entry.name, !!(entry.exalted || entry.mythic));
const farmLink = (entry) => ({ path: '/where-to-farm', query: { items: farmTokenOf(entry) } });
const missingForFarm = computed(() => (tab.value === 'runewords' ? [] : visible.value.filter((e) => !isFound(e))));
const addMissingToFarm = () => {
  const seen = new Set();
  for (const e of missingForFarm.value) {
    const token = farmTokenOf(e);
    if (seen.has(token)) continue;
    seen.add(token); farmList.add(token);
  }
};
const totalFound = computed(() => Object.values(progress.value).reduce((s, p) => s + p.found, 0));
const totalAll = computed(() => Object.values(progress.value).reduce((s, p) => s + p.total, 0));
const holdingFiles = computed(() => Object.keys(grail.holdings.value).length);
// the front page shows the numbers without loading the catalog
watch(progress, (p) => { if (catalog.value) grail.state.value = { ...grail.state.value, summary: p }; }, { deep: true });

// from the overview
const pickSlot = (s) => { slot.value = s; if (tab.value === 'runewords') tab.value = 'uniques'; if (!slotsInTab.value.includes(s)) tab.value = 'uniques'; document.getElementById('checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const pickTab = (t) => { tab.value = t; document.getElementById('checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const pickShow = (s) => { show.value = s; if (tab.value === 'runewords') tab.value = 'uniques'; document.getElementById('checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// a day picked on the heatmap narrows the Chronicle below
const timelineDay = ref(null);
const pickDay = (key) => { timelineDay.value = key; document.getElementById('chronicle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// a picture for Discord
const cardUrl = ref(null);
const cardCopied = ref(false);
let cardCanvas = null;
const openCard = () => {
  const recent = allEntries.value.filter((e) => e.record?.when).sort((a, b) => (b.record.when > a.record.when ? 1 : -1)).slice(0, 5)
    .map((e) => ({ name: e.name, kind: e.kind, date: dateFmt.format(new Date(e.record.when)).replace(/,? \d{2}:\d{2}$/, '') }));
  cardCanvas = drawGrailCard({
    found: totalFound.value, total: totalAll.value,
    perTab: TABS.map((x) => ({ label: x.label, found: progress.value[x.id].found, total: progress.value[x.id].total })),
    recent, stamp: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
  });
  cardUrl.value = cardCanvas.toDataURL('image/png');
};
const closeCard = () => { cardUrl.value = null; cardCanvas = null; };
const downloadCard = () => {
  if (!cardCanvas) return;
  cardCanvas.toBlob((blob) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relics-grail-${new Date().toISOString().slice(0, 10)}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
};
const canCopyImage = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
const copyCard = () => {
  if (!cardCanvas) return;
  cardCanvas.toBlob(async (blob) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); cardCopied.value = true; setTimeout(() => { cardCopied.value = false; }, 1500); } catch { /* blocked */ }
  }, 'image/png');
};

// a line for Discord
const copied = ref(false);
const copySummary = async () => {
  const pct = Math.round((totalFound.value / Math.max(1, totalAll.value)) * 100);
  const parts = TABS.map((x) => `${t(x.label)} ${progress.value[x.id].found}/${progress.value[x.id].total}`).join(' · ');
  const text = `${t('Relics of Sanctuary Grail: {found}/{total} ({pct} %)', { found: totalFound.value, total: totalAll.value, pct })}\n${parts}\nhttps://relicsofsanctuary.com/#/grail`;
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* clipboard blocked */ }
};
</script>

<template>
  <div class="container py-4 page-content grail-page">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">{{ $t('Grail') }}</h1>
        <p class="text-muted mb-0">{{ $t('Everything there is to find, ticked off from your save files - read here in the browser, never uploaded.') }}</p>
      </div>
      <div class="d-flex gap-2 align-items-center small">
        <button class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="copySummary">{{ copied ? $t('Copied') : $t('Copy summary') }}</button>
        <button class="btn btn-sm btn-outline-secondary" :disabled="!totalFound || !catalog" @click="openCard">{{ $t('Share as image') }}</button>
        <button class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="exportGrail">{{ $t('Back up') }}</button>
        <label class="btn btn-sm btn-outline-secondary mb-0">{{ $t('Restore') }} <input type="file" accept=".json" class="d-none" @change="restoreGrail" /></label>
        <button v-if="!confirmReset" class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="confirmReset = true">{{ $t('Reset') }}</button>
        <template v-else>
          <span class="text-warning">{{ $t('Forget everything?') }}</span>
          <button class="btn btn-sm btn-danger" @click="doReset">{{ $t('Yes') }}</button>
          <button class="btn btn-sm btn-outline-secondary" @click="confirmReset = false">{{ $t('No') }}</button>
        </template>
      </div>
    </div>
    <div v-if="restoreError" class="alert alert-warning py-2 small">{{ $t('Could not restore: {error}', { error: restoreError }) }}</div>
    <div v-if="loadError" class="alert alert-danger py-2 small">{{ $t('The parser did not load: {error}', { error: loadError }) }}</div>

    <!-- Import: the full drop zone until there is data, a slim bar afterwards -->
    <div class="card card-enhanced mb-4">
      <div v-if="totalFound && !importOpen && !lastImport" class="card-body p-3 d-flex flex-wrap justify-content-between align-items-center gap-2 small">
        <span class="text-muted">
          <template v-if="grail.state.value.imports?.length">
            {{ $t('Last import {date}', { date: dateFmt.format(new Date(grail.state.value.imports.at(-1).at)) }) }} · {{ grail.state.value.imports.at(-1).files.length === 1 ? $t('1 file') : $t('{n} files', { n: grail.state.value.imports.at(-1).files.length }) }}.
          </template>
          <template v-else>{{ $t('Ticked by hand so far.') }}</template>
          {{ $t('Importing again only ever adds.') }}
        </span>
        <button class="btn btn-sm btn-primary" @click="importOpen = true">{{ $t('Import save files') }}</button>
      </div>
      <div v-else class="card-body p-3">
        <div class="drop" :class="{ over: dragging, busy }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <div class="drop-title">{{ $t('Drop your save files here') }}</div>
          <div class="small text-muted mb-2">
            {{ $t('The shared stash') }} (<code>SharedStash…V2.d2i</code>, <code>ModernSharedStash…V2.d2i</code>) {{ $t('and your characters') }} (<code>.d2s</code>). {{ $t('For the mod they live in') }}
            <code>Saved Games\Diablo II Resurrected\mods\&lt;save path&gt;\</code>. {{ $t('Pick the whole folder if you like - only save files are read.') }}
          </div>
          <div class="d-flex flex-wrap gap-2 justify-content-center">
            <label class="btn btn-sm btn-primary mb-0">{{ $t('Choose files') }} <input type="file" multiple accept=".d2i,.d2s" class="d-none" @change="onPick" /></label>
            <label class="btn btn-sm btn-outline-primary mb-0">{{ $t('Choose folder') }} <input type="file" webkitdirectory class="d-none" @change="onPick" /></label>
          </div>
          <div v-if="busy" class="small text-muted mt-2">{{ $t('Reading…') }}</div>
        </div>
        <div class="form-check form-switch mt-3 mb-0 small">
          <input id="rotw" v-model="grail.rotwShift.value" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="rotw" :title="$t(`The D2RMM option moves the mod's uniques in front of the Warlock section, which renumbers every row from there on. Set it as your install has it, or the wrong items get ticked.`)">
            {{ $t('My D2RMM install has') }} <em>Moves RotW uniques to the end</em> {{ $t('switched on') }}
          </label>
        </div>
        <div v-if="lastImport" class="mt-3 small">
          <template v-if="lastImport.nothing"><span class="text-muted">{{ $t('No save files among those - the page reads') }} <code>.d2i</code> {{ $t('and') }} <code>.d2s</code>.</span></template>
          <template v-else>
            <div class="mb-1"><strong>{{ lastImport.added }}</strong> {{ lastImport.added === 1 ? $t('new entry') : $t('new entries') }} {{ $t('from') }} {{ lastImport.files.length === 1 ? $t('1 file') : $t('{n} files', { n: lastImport.files.length }) }}.</div>
            <ul class="list-unstyled mb-0 import-list">
              <li v-for="f in lastImport.files" :key="f.name" :class="{ 'text-danger': f.error }">
                {{ f.name }} <span class="text-muted">— {{ f.error ? f.error : `${$t(f.kind)}, ${$t('{n} items', { n: f.items })}${f.chronicle ? `, ${$t('Chronicle')}` : ''}` }}</span>
              </li>
            </ul>
          </template>
        </div>
        <div v-if="totalFound && (importOpen || lastImport)" class="mt-2 text-end">
          <button class="btn btn-sm btn-link text-muted p-0" @click="importOpen = false; lastImport = null">{{ $t('Hide') }}</button>
        </div>
      </div>
    </div>

    <!-- At a glance -->
    <GrailOverview
      v-if="catalog && totalFound"
      class="mb-4"
      :entries="allEntries" :tabs="TABS" :sources="catalog.sources ?? {}" :owned="grail.owned.value.items" :key-of="(e) => keysOf(e)[0]"
      @pick-slot="pickSlot" @pick-tab="pickTab" @pick-show="pickShow" @pick-day="pickDay"
    />
    <GrailMilestones v-if="catalog && totalFound" class="mb-4" :entries="allEntries" />

    <!-- The story and the odds -->
    <div v-if="catalog && totalFound" id="chronicle" class="row g-3 mb-4">
      <div class="col-lg-7"><GrailTimeline :entries="allEntries" :sources="catalog.sources ?? {}" :day="timelineDay" @clear-day="timelineDay = null" /></div>
      <div class="col-lg-5"><GrailRarity :entries="allEntries" :catalog="catalog" /></div>
    </div>

    <!-- Progress -->
    <div v-if="catalog" id="checklist" class="row g-3 mb-4">
      <div v-for="t in TABS" :key="t.id" class="col-6 col-lg">
        <button class="progress-card card card-enhanced h-100 w-100 text-start" :class="{ active: tab === t.id }" @click="tab = t.id">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-baseline">
              <span class="progress-label">{{ $t(t.label) }}</span>
              <span class="progress-pct">{{ progress[t.id].pct }} %</span>
            </div>
            <div class="progress grail-bar my-2"><div class="progress-bar" :style="{ width: `${progress[t.id].pct}%` }"></div></div>
            <div class="small text-muted">{{ $t('{n} of {total}', { n: progress[t.id].found, total: progress[t.id].total }) }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Checklist -->
    <div v-if="catalog" class="card card-enhanced mb-4">
      <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h2 class="h5 card-title m-0">
          {{ $t(TABS.find((t) => t.id === tab).label) }}
          <span class="text-muted fw-normal small"> · {{ progress[tab].found }} / {{ progress[tab].total }}</span>
          <span v-if="setsComplete" class="text-muted fw-normal small"> · {{ $t('{n} of {total} sets complete', { n: setsComplete.complete, total: setsComplete.total }) }}</span>
        </h2>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button v-for="tp in tierProgress" :key="tp.tier" class="badge tier-badge tier-toggle" :class="[`tier-${tp.tier}`, { dim: tiers.size && !tiers.has(tp.tier) }]" :title="$t('Only {tier}', { tier: $t(tp.label) })" @click="toggleTier(tp.tier)">
            {{ $t(tp.label) }} {{ tp.found }}/{{ tp.total }}
          </button>
        </div>
      </div>
      <div class="card-body p-3 pb-2">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input v-model="query" class="form-control form-control-sm search" :placeholder="tab === 'runewords' ? $t('Search name or rune…') : $t('Search name, base or set…')" />
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" :class="{ active: show === 'all' }" @click="show = 'all'">{{ $t('All') }}</button>
            <button class="btn btn-outline-secondary" :class="{ active: show === 'missing' }" @click="show = 'missing'">{{ $t('Missing') }}</button>
            <button class="btn btn-outline-secondary" :class="{ active: show === 'found' }" @click="show = 'found'">{{ $t('Found') }}</button>
            <button v-if="holdingFiles" class="btn btn-outline-secondary" :class="{ active: show === 'spares' }" :title="$t('Held more than once in your files')" @click="show = 'spares'">{{ $t('Spares') }}</button>
          </div>
          <select v-if="slotsInTab.length" v-model="slot" class="form-select form-select-sm w-auto">
            <option value="">{{ $t('Every slot') }}</option>
            <option v-for="s in slotsInTab" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="sort" class="form-select form-select-sm w-auto" :title="$t('Sort')">
            <option value="default">{{ isSetTab ? $t('Tier, set') : $t('Tier, level') }}</option>
            <option value="name">{{ $t('Name') }}</option>
            <option value="lvl">{{ $t('Level, high first') }}</option>
            <option value="date">{{ $t('Found, latest first') }}</option>
          </select>
          <div v-if="isSetTab" class="form-check form-switch small mb-0">
            <input id="groupsets" v-model="groupBySet" class="form-check-input" type="checkbox" :disabled="sort !== 'default'" />
            <label class="form-check-label" for="groupsets">{{ $t('Group by set') }}</label>
          </div>
          <button v-if="filtersActive" class="btn btn-sm btn-link text-muted p-0" @click="clearFilters">{{ $t('Clear') }}</button>
          <button v-if="missingForFarm.length" class="btn btn-sm btn-outline-primary ms-auto" :title="$t('Put the {n} missing items shown on the Where to Farm list', { n: missingForFarm.length })" @click="addMissingToFarm">
            + {{ $t('{n} missing to Where to Farm', { n: missingForFarm.length }) }}
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div v-if="visible.length === 0" class="p-3 text-muted small">{{ $t('Nothing here.') }}</div>
        <template v-else-if="grouped">
          <div v-for="sec in grouped" :key="sec.set" class="set-section">
            <div class="set-head" :class="{ complete: sec.found === sec.total }">
              <span class="set-name">{{ sec.set }}</span>
              <span class="small text-muted">{{ sec.found }} / {{ sec.total }}<template v-if="sec.found === sec.total"> · {{ $t('complete') }}</template></span>
              <div class="progress grail-bar set-bar"><div class="progress-bar" :style="{ width: `${(sec.found / sec.total) * 100}%` }"></div></div>
            </div>
            <ul class="list-unstyled mb-0 grail-list">
              <li v-for="e in sec.items" :key="e.kind + e.id" class="grail-row" :class="{ found: isFound(e) }">
                <input type="checkbox" class="form-check-input mt-0" :checked="isFound(e)" :title="isFound(e) ? $t('Untick (a later import will not tick it again unless it finds it)') : $t('Tick by hand')" @change="toggle(e)" />
                <div class="flex-grow-1 min-w-0">
                  <router-link :to="itemLink(e)" class="name" :class="e.kind">{{ e.name }}</router-link>
                  <span class="text-muted small"> · {{ e.base }}</span>
                  <span v-if="isRecent(e)" class="badge new-badge ms-1">{{ $t('new') }}</span>
                  <span v-if="ownedOf(e) > 1" class="badge copies-badge ms-1" :title="$t('{n} copies in your files', { n: ownedOf(e) })">×{{ ownedOf(e) }}</span>
                </div>
                <span v-if="e.tier != null" class="badge tier-badge" :class="`tier-${e.tier}`">{{ $t(TIER[e.tier]) }}</span>
                <span class="source small text-muted text-nowrap">{{ sourceText(e) }}</span>
                <router-link v-if="!isFound(e)" :to="farmLink(e)" class="farm-link small" :title="$t('Where to farm it')">{{ $t('farm') }}</router-link>
              </li>
            </ul>
          </div>
        </template>
        <ul v-else class="list-unstyled mb-0 grail-list">
          <li v-for="e in visible" :key="e.kind + e.id" class="grail-row" :class="{ found: isFound(e) }">
            <input type="checkbox" class="form-check-input mt-0" :checked="isFound(e)" :title="isFound(e) ? $t('Untick (a later import will not tick it again unless it finds it)') : $t('Tick by hand')" @change="toggle(e)" />
            <div class="flex-grow-1 min-w-0">
              <router-link :to="itemLink(e)" class="name" :class="e.kind">{{ e.name }}</router-link>
              <span v-if="e.kind !== 'runeword'" class="text-muted small"> · {{ e.base }}</span>
              <span v-if="e.set" class="text-muted small"> · {{ e.set }}</span>
              <span v-if="e.kind === 'runeword'" class="text-muted small"> · {{ e.runes.join(' ') }}</span>
              <span v-if="isRecent(e)" class="badge new-badge ms-1">{{ $t('new') }}</span>
              <span v-if="ownedOf(e) > 1" class="badge copies-badge ms-1" :title="$t('{n} copies in your files', { n: ownedOf(e) })">×{{ ownedOf(e) }}</span>
            </div>
            <span v-if="e.tier != null" class="badge tier-badge" :class="`tier-${e.tier}`">{{ $t(TIER[e.tier]) }}</span>
            <span class="source small text-muted text-nowrap">{{ sourceText(e) }}</span>
            <router-link v-if="e.kind !== 'runeword' && !isFound(e)" :to="farmLink(e)" class="farm-link small" :title="$t('Where to farm it')">{{ $t('farm') }}</router-link>
          </li>
        </ul>
      </div>
    </div>

    <!-- Runes -->
    <RuneCabinet v-if="catalog" :runes="catalog.runes ?? []" :counts="grail.owned.value.runes" :runewords="allEntries.filter((e) => e.kind === 'runeword')" :files="holdingFiles" />

    <Teleport to="body">
      <div v-if="cardUrl" class="card-backdrop" @mousedown.self="closeCard">
        <div class="card-modal">
          <img :src="cardUrl" alt="" class="card-img" />
          <div class="d-flex flex-wrap gap-2 justify-content-end mt-2">
            <span class="small text-muted me-auto">{{ $t('1200 × 630, the size Discord shows in full.') }}</span>
            <button v-if="canCopyImage" class="btn btn-sm btn-outline-secondary" @click="copyCard">{{ cardCopied ? $t('Copied') : $t('Copy image') }}</button>
            <button class="btn btn-sm btn-primary" @click="downloadCard">{{ $t('Download PNG') }}</button>
            <button class="btn btn-sm btn-outline-secondary" @click="closeCard">{{ $t('Close') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <p class="small text-muted mt-4 mb-0">
      {{ $t('Uniques and set items are matched by the row the save file stores, runewords by name. The Chronicle section of the shared stash lists what was found since it was last reset, with the minute and the monster; owned items and loose runes come from the stash and the characters; anything older you tick by hand. Ticks and imports stay in this browser - use Back up to move them.') }}
    </p>
  </div>
</template>

<style scoped>
.drop {
  border: 1px dashed rgba(201, 163, 106, 0.45); border-radius: 0.5rem; padding: 1.25rem; text-align: center;
  transition: border-color 0.15s, background 0.15s;
}
.drop.over { border-color: var(--d2r-gold-bright); background: rgba(212, 175, 55, 0.08); }
.drop.busy { opacity: 0.7; }
.card-backdrop { position: fixed; inset: 0; z-index: 2000; background: rgba(5, 4, 3, 0.75); display: flex; align-items: center; justify-content: center; padding: 1rem; }
.card-modal { width: min(900px, 100%); background: var(--d2r-panel); border: 1px solid rgba(201, 163, 106, 0.45); border-radius: 0.5rem; padding: 0.75rem; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7); }
.card-img { width: 100%; height: auto; border-radius: 0.3rem; display: block; }
.farm-link { color: var(--d2r-gold, #c9a36a); text-decoration: none; opacity: 0.7; }
.farm-link:hover { opacity: 1; text-decoration: underline; }
.drop-title { font-family: var(--font-display); font-size: 1.15rem; color: var(--d2r-gold-bright); margin-bottom: 0.25rem; }
.import-list li { padding: 0.1rem 0; }

.progress-card { border: 1px solid rgba(255, 255, 255, 0.08); cursor: pointer; color: var(--d2r-text); }
.progress-card.active { border-color: var(--d2r-gold); }
.progress-label { font-weight: 600; }
.progress-pct { font-family: var(--font-display); color: var(--d2r-gold-bright); }
.grail-bar { height: 6px; background: rgba(255, 255, 255, 0.08); }
.grail-bar .progress-bar { background: var(--d2r-gold); }

.search { max-width: 16rem; }
.grail-list .grail-row {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.grail-list .grail-row:first-child { border-top: 0; }
.grail-row.found { background: rgba(212, 175, 55, 0.05); }
.grail-row .name { text-decoration: none; }
.grail-row .name:hover { text-decoration: underline; }
.name.unique { color: #c7b377; }
.name.set { color: #7fdc7f; }
.name.runeword { color: #ffb84d; }
.min-w-0 { min-width: 0; }
.source { flex: 0 0 22rem; text-align: right; overflow: hidden; text-overflow: ellipsis; }
.tier-badge { background: rgba(255, 255, 255, 0.08); color: var(--d2r-text); font-weight: 500; }
.tier-0 { background: rgba(120, 160, 90, 0.3); }
.tier-1 { background: rgba(110, 140, 200, 0.3); }
.tier-2 { background: rgba(200, 160, 70, 0.3); }
.tier-toggle { border: 1px solid transparent; cursor: pointer; }
.tier-toggle.dim { opacity: 0.4; }
.new-badge { background: rgba(127, 220, 127, 0.25); color: #b9f0b9; font-weight: 500; }
.copies-badge { background: rgba(255, 255, 255, 0.1); color: var(--d2r-muted); font-weight: 500; }

.set-section { border-top: 1px solid rgba(255, 255, 255, 0.1); }
.set-section:first-child { border-top: 0; }
.set-head { display: grid; grid-template-columns: 1fr auto; gap: 0 0.75rem; align-items: baseline; padding: 0.5rem 0.75rem 0.35rem; background: rgba(255, 255, 255, 0.025); }
.set-head.complete .set-name { color: var(--d2r-gold-bright); }
.set-name { font-family: var(--font-display); font-size: 0.95rem; color: #7fdc7f; }
.set-bar { grid-column: 1 / -1; height: 3px; margin-top: 0.3rem; }
@media (max-width: 767px) { .source { display: none; } }
</style>
