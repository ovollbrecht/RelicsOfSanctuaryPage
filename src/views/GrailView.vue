<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useGrail, readSaveFile, absorb } from '@/composables/useGrail.js';
import { useFarmList, farmToken } from '@/composables/useFarmList.js';
import GrailOverview from '@/components/grail/GrailOverview.vue';
import RuneCabinet from '@/components/grail/RuneCabinet.vue';

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
const query = ref('');
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
const sourceText = (entry) => {
  const r = recordOf(entry);
  if (!r) return '';
  const where = { chronicle: 'Chronicle', stash: 'stash', character: r.who ? `on ${r.who}` : 'character', manual: 'ticked by hand' }[r.source] ?? r.source;
  const by = r.by && catalog.value?.sources?.[r.by] ? ` · ${catalog.value.sources[r.by]}` : '';
  return r.when ? `${where}${by} · ${dateFmt.format(new Date(r.when))}` : `${where}${by}`;
};
const itemLink = (entry) => (entry.kind === 'runeword'
  ? { path: '/runewords', query: { q: entry.name } }
  : { path: '/drop-calc', query: { mode: 'item', itemkind: entry.kind, item: entry.key } });

// a missing item's name is what the farm list wants - the exalted row goes in
// under its base name, since the planner counts the base and its variant together
const farmName = (entry) => entry.name.replace(/^(Exalted|Mythic) /, '');
const missingForFarm = computed(() => (tab.value === 'runewords' ? [] : visible.value.filter((e) => !isFound(e))));
const addMissingToFarm = () => {
  const seen = new Set();
  for (const e of missingForFarm.value) {
    const token = farmToken(e.kind, farmName(e));
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

// a line for Discord
const copied = ref(false);
const copySummary = async () => {
  const pct = Math.round((totalFound.value / Math.max(1, totalAll.value)) * 100);
  const parts = TABS.map((t) => `${t.label} ${progress.value[t.id].found}/${progress.value[t.id].total}`).join(' · ');
  const text = `Relics of Sanctuary Grail: ${totalFound.value}/${totalAll.value} (${pct} %)\n${parts}\nhttps://relicsofsanctuary.com/#/grail`;
  try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* clipboard blocked */ }
};
</script>

<template>
  <div class="container py-4 page-content grail-page">
    <div class="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-3">
      <div>
        <h1 class="h2 mb-1">Grail</h1>
        <p class="text-muted mb-0">Everything there is to find, ticked off from your save files - read here in the browser, never uploaded.</p>
      </div>
      <div class="d-flex gap-2 align-items-center small">
        <button class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="copySummary">{{ copied ? 'Copied' : 'Copy summary' }}</button>
        <button class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="exportGrail">Back up</button>
        <label class="btn btn-sm btn-outline-secondary mb-0">Restore <input type="file" accept=".json" class="d-none" @change="restoreGrail" /></label>
        <button v-if="!confirmReset" class="btn btn-sm btn-outline-secondary" :disabled="!totalFound" @click="confirmReset = true">Reset</button>
        <template v-else>
          <span class="text-warning">Forget everything?</span>
          <button class="btn btn-sm btn-danger" @click="doReset">Yes</button>
          <button class="btn btn-sm btn-outline-secondary" @click="confirmReset = false">No</button>
        </template>
      </div>
    </div>
    <div v-if="restoreError" class="alert alert-warning py-2 small">Could not restore: {{ restoreError }}</div>
    <div v-if="loadError" class="alert alert-danger py-2 small">The parser did not load: {{ loadError }}</div>

    <!-- Import: the full drop zone until there is data, a slim bar afterwards -->
    <div class="card card-enhanced mb-4">
      <div v-if="totalFound && !importOpen && !lastImport" class="card-body p-3 d-flex flex-wrap justify-content-between align-items-center gap-2 small">
        <span class="text-muted">
          <template v-if="grail.state.value.imports?.length">
            Last import {{ dateFmt.format(new Date(grail.state.value.imports.at(-1).at)) }} · {{ grail.state.value.imports.at(-1).files.length }} {{ grail.state.value.imports.at(-1).files.length === 1 ? 'file' : 'files' }}.
          </template>
          <template v-else>Ticked by hand so far.</template>
          Importing again only ever adds.
        </span>
        <button class="btn btn-sm btn-primary" @click="importOpen = true">Import save files</button>
      </div>
      <div v-else class="card-body p-3">
        <div class="drop" :class="{ over: dragging, busy }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <div class="drop-title">Drop your save files here</div>
          <div class="small text-muted mb-2">
            The shared stash (<code>SharedStash…V2.d2i</code>, <code>ModernSharedStash…V2.d2i</code>) and your characters (<code>.d2s</code>). For the mod they live in
            <code>Saved Games\Diablo II Resurrected\mods\&lt;save path&gt;\</code>. Pick the whole folder if you like - only save files are read.
          </div>
          <div class="d-flex flex-wrap gap-2 justify-content-center">
            <label class="btn btn-sm btn-primary mb-0">Choose files <input type="file" multiple accept=".d2i,.d2s" class="d-none" @change="onPick" /></label>
            <label class="btn btn-sm btn-outline-primary mb-0">Choose folder <input type="file" webkitdirectory class="d-none" @change="onPick" /></label>
          </div>
          <div v-if="busy" class="small text-muted mt-2">Reading…</div>
        </div>
        <div class="form-check form-switch mt-3 mb-0 small">
          <input id="rotw" v-model="grail.rotwShift.value" class="form-check-input" type="checkbox" />
          <label class="form-check-label" for="rotw" title="The D2RMM option moves the mod's uniques in front of the Warlock section, which renumbers every row from there on. Set it as your install has it, or the wrong items get ticked.">
            My D2RMM install has <em>Moves RotW uniques to the end</em> switched on
          </label>
        </div>
        <div v-if="lastImport" class="mt-3 small">
          <template v-if="lastImport.nothing"><span class="text-muted">No save files among those - the page reads <code>.d2i</code> and <code>.d2s</code>.</span></template>
          <template v-else>
            <div class="mb-1"><strong>{{ lastImport.added }}</strong> new {{ lastImport.added === 1 ? 'entry' : 'entries' }} from {{ lastImport.files.length }} {{ lastImport.files.length === 1 ? 'file' : 'files' }}.</div>
            <ul class="list-unstyled mb-0 import-list">
              <li v-for="f in lastImport.files" :key="f.name" :class="{ 'text-danger': f.error }">
                {{ f.name }} <span class="text-muted">— {{ f.error ? f.error : `${f.kind}, ${f.items} items${f.chronicle ? ', Chronicle' : ''}` }}</span>
              </li>
            </ul>
          </template>
        </div>
        <div v-if="totalFound && (importOpen || lastImport)" class="mt-2 text-end">
          <button class="btn btn-sm btn-link text-muted p-0" @click="importOpen = false; lastImport = null">Hide</button>
        </div>
      </div>
    </div>

    <!-- At a glance -->
    <GrailOverview
      v-if="catalog && totalFound"
      class="mb-4"
      :entries="allEntries" :tabs="TABS" :sources="catalog.sources ?? {}" :owned="grail.owned.value.items" :key-of="(e) => keysOf(e)[0]"
      @pick-slot="pickSlot" @pick-tab="pickTab" @pick-show="pickShow"
    />

    <!-- Progress -->
    <div v-if="catalog" id="checklist" class="row g-3 mb-4">
      <div v-for="t in TABS" :key="t.id" class="col-6 col-lg">
        <button class="progress-card card card-enhanced h-100 w-100 text-start" :class="{ active: tab === t.id }" @click="tab = t.id">
          <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-baseline">
              <span class="progress-label">{{ t.label }}</span>
              <span class="progress-pct">{{ progress[t.id].pct }} %</span>
            </div>
            <div class="progress grail-bar my-2"><div class="progress-bar" :style="{ width: `${progress[t.id].pct}%` }"></div></div>
            <div class="small text-muted">{{ progress[t.id].found }} of {{ progress[t.id].total }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Checklist -->
    <div v-if="catalog" class="card card-enhanced mb-4">
      <div class="card-header card-header-primary d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h2 class="h5 card-title m-0">
          {{ TABS.find((t) => t.id === tab).label }}
          <span class="text-muted fw-normal small"> · {{ progress[tab].found }} / {{ progress[tab].total }}</span>
          <span v-if="setsComplete" class="text-muted fw-normal small"> · {{ setsComplete.complete }} of {{ setsComplete.total }} sets complete</span>
        </h2>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button v-for="tp in tierProgress" :key="tp.tier" class="badge tier-badge tier-toggle" :class="[`tier-${tp.tier}`, { dim: tiers.size && !tiers.has(tp.tier) }]" :title="`Only ${tp.label}`" @click="toggleTier(tp.tier)">
            {{ tp.label }} {{ tp.found }}/{{ tp.total }}
          </button>
        </div>
      </div>
      <div class="card-body p-3 pb-2">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input v-model="query" class="form-control form-control-sm search" :placeholder="tab === 'runewords' ? 'Search name or rune…' : 'Search name, base or set…'" />
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" :class="{ active: show === 'all' }" @click="show = 'all'">All</button>
            <button class="btn btn-outline-secondary" :class="{ active: show === 'missing' }" @click="show = 'missing'">Missing</button>
            <button class="btn btn-outline-secondary" :class="{ active: show === 'found' }" @click="show = 'found'">Found</button>
            <button v-if="holdingFiles" class="btn btn-outline-secondary" :class="{ active: show === 'spares' }" title="Held more than once in your files" @click="show = 'spares'">Spares</button>
          </div>
          <select v-if="slotsInTab.length" v-model="slot" class="form-select form-select-sm w-auto">
            <option value="">Every slot</option>
            <option v-for="s in slotsInTab" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="sort" class="form-select form-select-sm w-auto" title="Sort">
            <option value="default">{{ isSetTab ? 'Tier, set' : 'Tier, level' }}</option>
            <option value="name">Name</option>
            <option value="lvl">Level, high first</option>
            <option value="date">Found, latest first</option>
          </select>
          <div v-if="isSetTab" class="form-check form-switch small mb-0">
            <input id="groupsets" v-model="groupBySet" class="form-check-input" type="checkbox" :disabled="sort !== 'default'" />
            <label class="form-check-label" for="groupsets">Group by set</label>
          </div>
          <button v-if="filtersActive" class="btn btn-sm btn-link text-muted p-0" @click="clearFilters">Clear</button>
          <button v-if="missingForFarm.length" class="btn btn-sm btn-outline-primary ms-auto" :title="`Put the ${missingForFarm.length} missing items shown on the Where to Farm list`" @click="addMissingToFarm">
            + {{ missingForFarm.length }} missing to Where to Farm
          </button>
        </div>
      </div>
      <div class="card-body p-0">
        <div v-if="visible.length === 0" class="p-3 text-muted small">Nothing here.</div>
        <template v-else-if="grouped">
          <div v-for="sec in grouped" :key="sec.set" class="set-section">
            <div class="set-head" :class="{ complete: sec.found === sec.total }">
              <span class="set-name">{{ sec.set }}</span>
              <span class="small text-muted">{{ sec.found }} / {{ sec.total }}<template v-if="sec.found === sec.total"> · complete</template></span>
              <div class="progress grail-bar set-bar"><div class="progress-bar" :style="{ width: `${(sec.found / sec.total) * 100}%` }"></div></div>
            </div>
            <ul class="list-unstyled mb-0 grail-list">
              <li v-for="e in sec.items" :key="e.kind + e.id" class="grail-row" :class="{ found: isFound(e) }">
                <input type="checkbox" class="form-check-input mt-0" :checked="isFound(e)" :title="isFound(e) ? 'Untick (a later import will not tick it again unless it finds it)' : 'Tick by hand'" @change="toggle(e)" />
                <div class="flex-grow-1 min-w-0">
                  <router-link :to="itemLink(e)" class="name" :class="e.kind">{{ e.name }}</router-link>
                  <span class="text-muted small"> · {{ e.base }}</span>
                  <span v-if="isRecent(e)" class="badge new-badge ms-1">new</span>
                  <span v-if="ownedOf(e) > 1" class="badge copies-badge ms-1" :title="`${ownedOf(e)} copies in your files`">×{{ ownedOf(e) }}</span>
                </div>
                <span v-if="e.tier != null" class="badge tier-badge" :class="`tier-${e.tier}`">{{ TIER[e.tier] }}</span>
                <span class="source small text-muted text-nowrap">{{ sourceText(e) }}</span>
              </li>
            </ul>
          </div>
        </template>
        <ul v-else class="list-unstyled mb-0 grail-list">
          <li v-for="e in visible" :key="e.kind + e.id" class="grail-row" :class="{ found: isFound(e) }">
            <input type="checkbox" class="form-check-input mt-0" :checked="isFound(e)" :title="isFound(e) ? 'Untick (a later import will not tick it again unless it finds it)' : 'Tick by hand'" @change="toggle(e)" />
            <div class="flex-grow-1 min-w-0">
              <router-link :to="itemLink(e)" class="name" :class="e.kind">{{ e.name }}</router-link>
              <span v-if="e.kind !== 'runeword'" class="text-muted small"> · {{ e.base }}</span>
              <span v-if="e.set" class="text-muted small"> · {{ e.set }}</span>
              <span v-if="e.kind === 'runeword'" class="text-muted small"> · {{ e.runes.join(' ') }}</span>
              <span v-if="isRecent(e)" class="badge new-badge ms-1">new</span>
              <span v-if="ownedOf(e) > 1" class="badge copies-badge ms-1" :title="`${ownedOf(e)} copies in your files`">×{{ ownedOf(e) }}</span>
            </div>
            <span v-if="e.tier != null" class="badge tier-badge" :class="`tier-${e.tier}`">{{ TIER[e.tier] }}</span>
            <span class="source small text-muted text-nowrap">{{ sourceText(e) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Runes -->
    <RuneCabinet v-if="catalog" :runes="catalog.runes ?? []" :counts="grail.owned.value.runes" :runewords="allEntries.filter((e) => e.kind === 'runeword')" :files="holdingFiles" />

    <p class="small text-muted mt-4 mb-0">
      Uniques and set items are matched by the row the save file stores, runewords by name. The Chronicle section of the shared stash lists what was found since it
      was last reset, with the minute and the monster; owned items and loose runes come from the stash and the characters; anything older you tick by hand. Ticks and
      imports stay in this browser - use Back up to move them.
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
