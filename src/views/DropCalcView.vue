<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dropData from '@/assets/dropcalc.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import {
  buildContext, computeMonsterDrops, computeItemDetail, computeItemSources,
  formatChance, playerBonus, effectiveMf, noDropChance, DIFFICULTIES,
} from '@/composables/useDropSimulation.js';

// ---------- settings ----------
const dataMode = ref('mod');
const difficulty = ref(2);
const players = ref(1);
const party = ref(1);
const mf = ref(0);
const terrorEnabled = ref(false);
const charLevel = ref(99);
const exaltedEnabled = ref(true);
const exaltedPercent = ref(5);
const mythicEnabled = ref(true);
const mythicPercent = ref(5);
const chanceFormat = ref('ratio');

// ---------- source ----------
const sourceKind = ref('monster'); // monster | superunique | herald | chest | rawTc
const sourceType = ref('normal'); // normal | champion | unique | minion | quest
const selectedMonster = ref(null);
// token: 'su:<idx>' | 'boss:<monsterIdx>' | 'bossq:<monsterIdx>'
const selectedSuperSource = ref(null);
const selectedAreaId = ref(null);
const selectedTc = ref(null);
const heraldTier = ref(5);

// ---------- results view ----------
const viewMode = ref('source'); // source (monster -> drops) | item (item -> sources)
const filterKind = ref('all'); // all | uniques | sets | runes
const sortBy = ref('chance'); // chance | name | index (runes only)
const sortDir = ref('desc'); // clicking the active sort again flips it
const detailBaseIndex = ref(null);

const SORT_DEFAULT_DIR = { chance: 'desc', name: 'asc', index: 'asc' };

const setSort = (key) => {
  if (sortBy.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = key;
    sortDir.value = SORT_DEFAULT_DIR[key];
  }
};

const sortArrow = (key) =>
  sortBy.value === key ? (sortDir.value === 'asc' ? ' ▲' : ' ▼') : '';

// rune number from the item code (r01..r33) for the index sort
const runeNumber = (row) => {
  const code = row.baseIndex >= 0 ? dropData.BaseItems[row.baseIndex].Code : '';
  const match = /^r(\d+)$/.exec(code);
  return match ? Number(match[1]) : 999;
};

watch(filterKind, () => {
  if (sortBy.value === 'index' && filterKind.value !== 'runes') {
    sortBy.value = 'chance';
    sortDir.value = 'desc';
  }
});

// ---------- item mode ----------
const itemKind = ref('unique'); // unique | set | base
const selectedItem = ref(null);
const allDifficulties = ref(false);
const ITEM_ROW_LIMIT = 300;

const ctx = computed(() => buildContext(dropData, {
  dataMode: dataMode.value,
  players: players.value,
  partyNearby: party.value,
  mf: mf.value,
  terror: { enabled: terrorEnabled.value, charLevel: charLevel.value },
  exalted: { enabled: exaltedEnabled.value && dataMode.value === 'mod', percent: exaltedPercent.value },
  mythic: { enabled: mythicEnabled.value && dataMode.value === 'mod', percent: mythicPercent.value },
  heraldTier: heraldTier.value,
}));

const bonus = computed(() => playerBonus(players.value, party.value));
const mfInfo = computed(() => effectiveMf(mf.value));
const heraldAvailable = computed(() => (dropData.Meta?.HeraldTcIndex ?? -1) >= 0);

// ---------- pickers ----------
const monsterOptions = computed(() => {
  const nameCounts = new Map();
  dropData.Monsters.forEach(m => nameCounts.set(m.Name, (nameCounts.get(m.Name) ?? 0) + 1));
  return dropData.Monsters
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => !m.Boss) // bosses live in the Superunique / Boss picker
    .map(({ m, index }) => ({
      value: index,
      label: nameCounts.get(m.Name) > 1 ? `${m.Name} (${m.Id})` : m.Name,
      hint: `mlvl ${m.Levels[difficulty.value]}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

// quest kill drops differently than a regular kill in at least one difficulty
const bossQuestDiffers = (m) =>
  m.Tcs.some(row => row[3] >= 0 && row[3] !== row[2]);

const superSourceOptions = computed(() => {
  const options = dropData.SuperUniques
    .map((su, index) => ({ value: `su:${index}`, label: su.Name, hint: areaName(su.Areas[0]) }));
  dropData.Monsters.forEach((m, index) => {
    if (!m.Boss) return;
    options.push({ value: `boss:${index}`, label: m.Name, hint: 'Boss' });
    if (bossQuestDiffers(m)) {
      options.push({ value: `bossq:${index}`, label: `${m.Name} (Quest)`, hint: 'Boss, first kill' });
    }
  });
  return options.sort((a, b) => a.label.localeCompare(b.label));
});

const areaOptions = computed(() =>
  dropData.Areas
    .filter(a => a.ChestTcs[difficulty.value] >= 0)
    .map(a => ({ value: a.Id, label: a.Name, hint: `alvl ${a.Levels[difficulty.value]}` }))
    .sort((a, b) => a.label.localeCompare(b.label)));

const tcOptions = computed(() =>
  ctx.value.tcs
    .map((tc, index) => ({ value: index, label: tc.Name }))
    .sort((a, b) => a.label.localeCompare(b.label)));

const currentMonster = computed(() =>
  selectedMonster.value != null ? dropData.Monsters[selectedMonster.value] : null);

// areas the selected monster spawns in (drives NM/Hell area level)
const monsterAreaOptions = computed(() => {
  if (!currentMonster.value) return [];
  return currentMonster.value.Areas[difficulty.value]
    .map(id => ({ value: id, label: areaName(id), hint: `alvl ${ctx.value.areasById.get(id)?.Levels[difficulty.value] ?? '?'}` }));
});

watch([selectedMonster, difficulty], () => {
  selectedAreaId.value = monsterAreaOptions.value[0]?.value ?? null;
});

const hasQuestTc = computed(() =>
  currentMonster.value && currentMonster.value.Tcs[difficulty.value][3] >= 0);

function areaName(id) {
  return dropData.Areas.find(a => a.Id === id)?.Name ?? `Area ${id}`;
}

// ---------- item pickers ----------
const uniqueItemOptions = computed(() =>
  ctx.value.uniques
    .map((u, index) => ({ u, index }))
    .filter(({ u }) => u.Spawnable)
    .map(({ u, index }) => ({
      value: index,
      label: u.Base >= 0 ? `${u.Name} (${dropData.BaseItems[u.Base].Name})` : u.Name,
      hint: `lvl ${u.Lvl}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label)));

const setItemOptions = computed(() =>
  ctx.value.sets
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.Spawnable)
    .map(({ s, index }) => ({ value: index, label: `${s.Name} (${s.SetName})`, hint: `lvl ${s.Lvl}` }))
    .sort((a, b) => a.label.localeCompare(b.label)));

const baseItemOptions = computed(() =>
  dropData.BaseItems
    .map((b, index) => ({ value: index, label: b.Name, hint: `qlvl ${b.Qlvl}` }))
    .sort((a, b) => a.label.localeCompare(b.label)));

const itemOptions = computed(() =>
  itemKind.value === 'unique' ? uniqueItemOptions.value
    : itemKind.value === 'set' ? setItemOptions.value
    : baseItemOptions.value);

watch([itemKind, dataMode], () => { selectedItem.value = null; });

// ---------- computation ----------
const selection = computed(() => {
  if (sourceKind.value === 'monster' && selectedMonster.value != null) {
    const effectiveType = sourceType.value === 'normal' && currentMonster.value?.Boss
      ? 'boss'
      : sourceType.value;
    return {
      kind: 'monster',
      monsterIndex: selectedMonster.value,
      sourceType: effectiveType,
      difficulty: difficulty.value,
      areaId: selectedAreaId.value,
    };
  }
  if (sourceKind.value === 'superunique' && selectedSuperSource.value != null) {
    const [token, idxStr] = selectedSuperSource.value.split(':');
    const index = Number(idxStr);
    if (token === 'su') {
      return { kind: 'superunique', superUniqueIndex: index, difficulty: difficulty.value };
    }
    return {
      kind: 'monster',
      monsterIndex: index,
      sourceType: token === 'bossq' ? 'quest' : 'boss',
      difficulty: difficulty.value,
    };
  }
  if (sourceKind.value === 'herald') {
    return { kind: 'herald', difficulty: difficulty.value };
  }
  if (sourceKind.value === 'chest' && selectedAreaId.value != null) {
    return { kind: 'chest', areaId: selectedAreaId.value, difficulty: difficulty.value };
  }
  if (sourceKind.value === 'rawTc' && selectedTc.value != null) {
    return { kind: 'rawTc', tcIndex: selectedTc.value, difficulty: difficulty.value };
  }
  return null;
});

const result = computed(() => {
  if (!selection.value) return null;
  return computeMonsterDrops(ctx.value, selection.value);
});

const variantsEnabled = computed(() =>
  dataMode.value === 'mod' && (exaltedEnabled.value || mythicEnabled.value));

const filteredRows = computed(() => {
  if (!result.value) return [];
  let rows = result.value.rows;
  if (filterKind.value === 'uniques') rows = rows.filter(r => r.kind === 'unique');
  else if (filterKind.value === 'sets') rows = rows.filter(r => r.kind === 'set');
  else if (filterKind.value === 'runes') rows = rows.filter(r => r.kind === 'base' && r.isRune);

  const direction = sortDir.value === 'asc' ? 1 : -1;
  if (sortBy.value === 'name') {
    rows = [...rows].sort((a, b) => direction * a.name.localeCompare(b.name));
  } else if (sortBy.value === 'index') {
    rows = [...rows].sort((a, b) => direction * (runeNumber(a) - runeNumber(b)));
  } else {
    // rows arrive chance-descending from the engine
    rows = sortDir.value === 'desc' ? rows : [...rows].reverse();
  }
  return rows;
});

// background bars: rune frequency relative to the most common listed rune
const maxRuneChance = computed(() => {
  if (filterKind.value !== 'runes') return 0;
  return filteredRows.value.reduce((max, r) => Math.max(max, r.chance), 0);
});

// "if a rune drops, which one is it" - share of the summed rune chance
const runeChanceSum = computed(() => {
  if (filterKind.value !== 'runes') return 0;
  return filteredRows.value.reduce((sum, r) => sum + r.chance, 0);
});

const runeLabel = (name) => name.replace(/ Rune$/, '');

// variant column only where the listed rows can actually carry one
const showVariantColumn = computed(() =>
  variantsEnabled.value && filteredRows.value.some(r => r.variantChance != null));
const showItemVariantColumn = computed(() =>
  variantsEnabled.value && (itemRows.value ?? []).some(r => r.variantChance != null));
const showDetailVariantColumn = computed(() =>
  variantsEnabled.value && detail.value != null &&
  [...detail.value.uniqueRows, ...detail.value.setRows].some(r => r.variantChance != null));

// aggregated chances over the full drop table (additive, like the row values)
const summary = computed(() => {
  if (!result.value) return null;
  const sum = (predicate, key = 'chance') => result.value.rows
    .filter(predicate)
    .reduce((total, r) => total + (r[key] ?? 0), 0);
  return {
    unique: sum(r => r.kind === 'unique'),
    uniqueVariant: sum(r => r.kind === 'unique', 'variantChance'),
    set: sum(r => r.kind === 'set'),
    setVariant: sum(r => r.kind === 'set', 'variantChance'),
    rune: sum(r => r.kind === 'base' && r.isRune),
  };
});

const noDrop = computed(() => {
  if (!result.value) return null;
  return noDropChance(ctx.value, result.value.source.upgradedTcIndex, bonus.value);
});

const sourceInfo = computed(() => {
  if (!result.value) return null;
  const src = result.value.source;
  return {
    mlvl: src.mlvl,
    baseMlvl: src.baseMlvl,
    terrorized: src.terrorized,
    tcName: src.tcIndex >= 0 ? ctx.value.tcs[src.tcIndex].Name : '-',
    upgradedTcName: src.upgradedTcIndex >= 0 ? ctx.value.tcs[src.upgradedTcIndex].Name : '-',
  };
});

const fmt = (p) => formatChance(p, chanceFormat.value);

const rowLabel = (row) => {
  if (row.kind === 'unique') return row.baseName ? `${row.name} (${row.baseName})` : row.name;
  if (row.kind === 'set') return `${row.name} (${row.setName})`;
  return row.name;
};

// ---------- detail (color table for one base item) ----------
const detail = computed(() => {
  if (detailBaseIndex.value == null || !selection.value) return null;
  const d = computeItemDetail(ctx.value, selection.value, detailBaseIndex.value);
  return d.found ? d : null;
});

watch([selection, dataMode], () => { detailBaseIndex.value = null; });

const openDetail = (row) => {
  if (row.baseIndex != null && row.baseIndex >= 0 && !row.direct) {
    detailBaseIndex.value = row.baseIndex;
  }
};

// chance to see the item at least once in n kills
const cumulative = (p, n) => 1 - Math.pow(1 - p, n);
const CUMULATIVE_KILLS = [1, 10, 50, 100, 1000];

const qualityRows = computed(() => {
  if (!detail.value) return [];
  const q = detail.value.quality;
  const p = detail.value.baseChance;
  return [
    ['Rare', q.rare], ['Magic', q.magic], ['Superior', q.hiq],
    ['Normal', q.normal], ['Low Quality', q.low],
  ].filter(([, rel]) => rel > 0).map(([label, rel]) => ({ label, relative: rel, chance: p * rel }));
});

// ---------- item -> sources ----------
const itemRows = computed(() => {
  if (viewMode.value !== 'item' || selectedItem.value == null) return null;
  return computeItemSources(ctx.value, {
    itemKind: itemKind.value,
    itemIndex: selectedItem.value,
    difficulty: allDifficulties.value ? null : difficulty.value,
  });
});

const sourceTypeLabel = (row) => {
  const label = row.sourceType === 'superunique' ? 'Superunique'
    : row.sourceType.charAt(0).toUpperCase() + row.sourceType.slice(1);
  return label;
};

const jumpToSource = (row) => {
  viewMode.value = 'source';
  difficulty.value = row.difficulty;
  if (row.sourceType === 'superunique') {
    sourceKind.value = 'superunique';
    selectedSuperSource.value = `su:${row.superUniqueIndex}`;
  } else if (row.sourceType === 'boss') {
    sourceKind.value = 'superunique';
    selectedSuperSource.value = `boss:${row.monsterIndex}`;
  } else {
    sourceKind.value = 'monster';
    selectedMonster.value = row.monsterIndex;
    sourceType.value = row.sourceType;
    if (row.areaId != null) selectedAreaId.value = row.areaId;
  }
};

// ---------- URL query sync (stable string ids, defaults omitted) ----------
const route = useRoute();
const router = useRouter();

const clampInt = (value, min, max, fallback) => {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

onMounted(() => {
  const q = route.query;
  if (q.mode === 'item') viewMode.value = 'item';
  difficulty.value = clampInt(q.diff, 0, 2, difficulty.value);
  players.value = clampInt(q.players, 1, 8, players.value);
  party.value = clampInt(q.party, 1, players.value, party.value);
  mf.value = clampInt(q.mf, 0, 9999, mf.value);
  if (q.data === 'vanilla') dataMode.value = 'vanilla';
  if (q.tz === '1') terrorEnabled.value = true;
  charLevel.value = clampInt(q.clvl, 1, 99, charLevel.value);
  if (q.ex === '0') exaltedEnabled.value = false;
  exaltedPercent.value = clampInt(q.exp, 1, 99, exaltedPercent.value);
  if (q.my === '0') mythicEnabled.value = false;
  mythicPercent.value = clampInt(q.myp, 1, 99, mythicPercent.value);
  if (q.fmt === 'pct') chanceFormat.value = 'pct';
  if (['all', 'uniques', 'sets', 'runes'].includes(q.filter)) filterKind.value = q.filter;
  if (['name', 'index'].includes(q.sort)) sortBy.value = q.sort;
  sortDir.value = ['asc', 'desc'].includes(q.dir) ? q.dir : SORT_DEFAULT_DIR[sortBy.value];
  if (['monster', 'superunique', 'herald', 'chest', 'rawTc'].includes(q.src)) sourceKind.value = q.src;
  if (['normal', 'champion', 'unique', 'minion', 'quest'].includes(q.type)) sourceType.value = q.type;
  heraldTier.value = clampInt(q.ht, 1, 5, heraldTier.value);

  if (q.monster) {
    const idx = dropData.Monsters.findIndex(m => m.Id === q.monster);
    if (idx >= 0) selectedMonster.value = idx;
  }
  if (q.su) {
    const idx = dropData.SuperUniques.findIndex(s => s.Id === q.su);
    if (idx >= 0) selectedSuperSource.value = `su:${idx}`;
  }
  if (q.boss || q.bossq) {
    const idx = dropData.Monsters.findIndex(m => m.Id === (q.boss ?? q.bossq));
    if (idx >= 0) selectedSuperSource.value = `${q.boss ? 'boss' : 'bossq'}:${idx}`;
  }
  if (q.area) {
    const id = parseInt(String(q.area), 10);
    if (dropData.Areas.some(a => a.Id === id)) {
      // after the monster-change watcher has reset the area to its default
      nextTick(() => { selectedAreaId.value = id; });
    }
  }
  if (q.tc) {
    const idx = ctx.value.tcs.findIndex(t => t.Name === q.tc);
    if (idx >= 0) selectedTc.value = idx;
  }
  if (['unique', 'set', 'base'].includes(q.itemkind)) itemKind.value = q.itemkind;
  if (q.alldiff === '1') allDifficulties.value = true;
  if (q.item) {
    const idx = itemKind.value === 'unique' ? dropData.Uniques.findIndex(u => u.Index === q.item)
      : itemKind.value === 'set' ? dropData.Sets.findIndex(s => s.Index === q.item)
      : dropData.BaseItems.findIndex(b => b.Code === q.item);
    if (idx >= 0) selectedItem.value = idx;
  }
});

watch(
  [viewMode, difficulty, players, party, mf, dataMode, terrorEnabled, charLevel,
   exaltedEnabled, exaltedPercent, mythicEnabled, mythicPercent, chanceFormat,
   filterKind, sortBy, sortDir, sourceKind, sourceType, selectedMonster, selectedSuperSource,
   selectedAreaId, selectedTc, itemKind, selectedItem, allDifficulties, heraldTier],
  () => {
    router.replace({
      query: {
        ...(viewMode.value !== 'source' ? { mode: viewMode.value } : {}),
        ...(difficulty.value !== 2 ? { diff: String(difficulty.value) } : {}),
        ...(players.value !== 1 ? { players: String(players.value) } : {}),
        ...(party.value !== 1 ? { party: String(party.value) } : {}),
        ...(mf.value !== 0 ? { mf: String(mf.value) } : {}),
        ...(dataMode.value !== 'mod' ? { data: dataMode.value } : {}),
        ...(terrorEnabled.value ? { tz: '1' } : {}),
        ...(terrorEnabled.value && charLevel.value !== 99 ? { clvl: String(charLevel.value) } : {}),
        ...(!exaltedEnabled.value ? { ex: '0' } : {}),
        ...(exaltedPercent.value !== 5 ? { exp: String(exaltedPercent.value) } : {}),
        ...(!mythicEnabled.value ? { my: '0' } : {}),
        ...(mythicPercent.value !== 5 ? { myp: String(mythicPercent.value) } : {}),
        ...(chanceFormat.value !== 'ratio' ? { fmt: chanceFormat.value } : {}),
        ...(filterKind.value !== 'all' ? { filter: filterKind.value } : {}),
        ...(sortBy.value !== 'chance' ? { sort: sortBy.value } : {}),
        ...(sortDir.value !== SORT_DEFAULT_DIR[sortBy.value] ? { dir: sortDir.value } : {}),
        ...(sourceKind.value !== 'monster' ? { src: sourceKind.value } : {}),
        ...(sourceType.value !== 'normal' ? { type: sourceType.value } : {}),
        ...(selectedMonster.value != null ? { monster: dropData.Monsters[selectedMonster.value].Id } : {}),
        ...(selectedSuperSource.value?.startsWith('su:')
          ? { su: dropData.SuperUniques[Number(selectedSuperSource.value.slice(3))].Id } : {}),
        ...(selectedSuperSource.value?.startsWith('boss:')
          ? { boss: dropData.Monsters[Number(selectedSuperSource.value.slice(5))].Id } : {}),
        ...(selectedSuperSource.value?.startsWith('bossq:')
          ? { bossq: dropData.Monsters[Number(selectedSuperSource.value.slice(6))].Id } : {}),
        ...(sourceKind.value === 'herald' && heraldTier.value !== 5 ? { ht: String(heraldTier.value) } : {}),
        ...(selectedAreaId.value != null && (sourceKind.value === 'chest' || monsterAreaOptions.value.length > 1)
          ? { area: String(selectedAreaId.value) } : {}),
        ...(selectedTc.value != null && sourceKind.value === 'rawTc' ? { tc: ctx.value.tcs[selectedTc.value].Name } : {}),
        ...(itemKind.value !== 'unique' ? { itemkind: itemKind.value } : {}),
        ...(selectedItem.value != null
          ? { item: itemKind.value === 'unique' ? dropData.Uniques[selectedItem.value].Index
              : itemKind.value === 'set' ? dropData.Sets[selectedItem.value].Index
              : dropData.BaseItems[selectedItem.value].Code }
          : {}),
        ...(allDifficulties.value ? { alldiff: '1' } : {}),
      },
    });
  },
);
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">❖</span>
          Drop Calculator
          <span class="title-icon">❖</span>
        </h1>
      </div>
    </div>

    <!-- Settings -->
    <div class="card controls-card mb-3">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label text-warning">Difficulty</label>
            <div class="btn-group w-100">
              <button
                v-for="(name, index) in DIFFICULTIES"
                :key="name"
                class="btn btn-sm pill"
                :class="{ active: difficulty === index }"
                @click="difficulty = index"
              >{{ name }}</button>
            </div>
          </div>
          <div class="col-md-2">
            <label class="form-label text-warning">Players</label>
            <input v-model.number="players" type="number" min="1" max="8" class="form-control" />
          </div>
          <div class="col-md-2">
            <label class="form-label text-warning" title="Players in your party near the kill">Party nearby</label>
            <input v-model.number="party" type="number" min="1" :max="players" class="form-control" />
          </div>
          <div class="col-md-2">
            <label class="form-label text-warning">Magic Find</label>
            <input v-model.number="mf" type="number" min="0" max="9999" class="form-control" />
          </div>
          <div class="col-md-3">
            <label class="form-label text-warning">Data</label>
            <div class="btn-group w-100">
              <button class="btn btn-sm pill" :class="{ active: dataMode === 'mod' }" @click="dataMode = 'mod'">
                Relics of Sanctuary
              </button>
              <button class="btn btn-sm pill" :class="{ active: dataMode === 'vanilla' }" @click="dataMode = 'vanilla'">
                Vanilla
              </button>
            </div>
          </div>
        </div>

        <div class="row g-3 mt-1 align-items-center">
          <div class="col-md-3">
            <div class="form-check option-toggle">
              <input id="terror" v-model="terrorEnabled" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="terror">Terror Zone</label>
            </div>
            <input
              v-model.number="charLevel"
              type="number" min="1" max="99"
              class="form-control form-control-sm mt-1"
              :class="{ 'option-hidden': !terrorEnabled }"
              title="Character level of the game creator"
            />
          </div>
          <div v-if="dataMode === 'mod'" class="col-md-3">
            <div class="form-check option-toggle">
              <input id="exalted" v-model="exaltedEnabled" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="exalted">Exalted uniques</label>
            </div>
            <div class="input-group input-group-sm mt-1" :class="{ 'option-hidden': !exaltedEnabled }">
              <input v-model.number="exaltedPercent" type="number" min="1" max="99" class="form-control" />
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div v-if="dataMode === 'mod'" class="col-md-3">
            <div class="form-check option-toggle">
              <input id="mythic" v-model="mythicEnabled" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="mythic">Mythic set items</label>
            </div>
            <div class="input-group input-group-sm mt-1" :class="{ 'option-hidden': !mythicEnabled }">
              <input v-model.number="mythicPercent" type="number" min="1" max="99" class="form-control" />
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div class="col-md-3 text-md-end info-note">
            Player bonus: <strong>{{ bonus }}</strong>
            <template v-if="mf > 0">
              <br />
              Effective MF:
              <span title="Unique / Set / Rare / Magic after diminishing returns">
                {{ mfInfo.unique }} / {{ mfInfo.set }} / {{ mfInfo.rare }} / {{ mfInfo.magic }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Mode -->
    <div class="d-flex flex-wrap gap-2 mb-3">
      <button class="btn btn-sm pill mode-pill" :class="{ active: viewMode === 'source' }" @click="viewMode = 'source'">Monster → Drops</button>
      <button class="btn btn-sm pill mode-pill" :class="{ active: viewMode === 'item' }" @click="viewMode = 'item'">Item → Sources</button>
    </div>

    <!-- Source -->
    <div v-if="viewMode === 'source'" class="card controls-card mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'monster' }" @click="sourceKind = 'monster'">Monster</button>
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'superunique' }" @click="sourceKind = 'superunique'">Superunique / Boss</button>
          <button v-if="heraldAvailable" class="btn btn-sm pill" :class="{ active: sourceKind === 'herald' }" @click="sourceKind = 'herald'">Herald</button>
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'chest' }" @click="sourceKind = 'chest'">Chest</button>
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'rawTc' }" @click="sourceKind = 'rawTc'">Treasure Class</button>
        </div>

        <div class="row g-3 align-items-end">
          <template v-if="sourceKind === 'monster'">
            <div class="col-md-4">
              <label class="form-label text-warning">Monster</label>
              <SearchableSelect v-model="selectedMonster" :options="monsterOptions" placeholder="Search monsters..." />
            </div>
            <div class="col-md-4">
              <label class="form-label text-warning">Type</label>
              <div class="btn-group w-100 flex-wrap">
                <button
                  v-for="type in ['normal', 'champion', 'unique', 'minion']"
                  :key="type"
                  class="btn btn-sm pill"
                  :class="{ active: sourceType === type }"
                  @click="sourceType = type"
                >{{ currentMonster?.Boss && type === 'normal' ? 'Boss' : type.charAt(0).toUpperCase() + type.slice(1) }}</button>
                <button
                  v-if="hasQuestTc"
                  class="btn btn-sm pill"
                  :class="{ active: sourceType === 'quest' }"
                  @click="sourceType = 'quest'"
                >Quest kill</button>
              </div>
            </div>
            <div v-if="monsterAreaOptions.length > 1" class="col-md-4">
              <label class="form-label text-warning">Area</label>
              <SearchableSelect v-model="selectedAreaId" :options="monsterAreaOptions" placeholder="Area..." />
            </div>
          </template>

          <template v-else-if="sourceKind === 'superunique'">
            <div class="col-md-5">
              <label class="form-label text-warning">Superunique / Boss</label>
              <SearchableSelect v-model="selectedSuperSource" :options="superSourceOptions" placeholder="Search superuniques and bosses..." />
            </div>
          </template>

          <template v-else-if="sourceKind === 'herald'">
            <div class="col-md-3">
              <label class="form-label text-warning">Herald tier</label>
              <div class="btn-group w-100">
                <button
                  v-for="tier in [1, 2, 3, 4, 5]"
                  :key="tier"
                  class="btn btn-sm pill"
                  :class="{ active: heraldTier === tier }"
                  @click="heraldTier = tier"
                >{{ tier }}</button>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label text-warning" title="Heralds are terror-zone elites - their level follows the game creator's character level">Character level</label>
              <input v-model.number="charLevel" type="number" min="1" max="99" class="form-control" />
            </div>
            <div class="col-md-6 info-note align-self-end">
              Heralds are terror-zone elites. Sunder charms require herald tier 4+.
            </div>
          </template>

          <template v-else-if="sourceKind === 'chest'">
            <div class="col-md-5">
              <label class="form-label text-warning">Area</label>
              <SearchableSelect v-model="selectedAreaId" :options="areaOptions" placeholder="Search areas..." />
            </div>
          </template>

          <template v-else>
            <div class="col-md-5">
              <label class="form-label text-warning">Treasure Class</label>
              <SearchableSelect v-model="selectedTc" :options="tcOptions" placeholder="Search treasure classes..." />
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Item -> Sources -->
    <div v-if="viewMode === 'item'" class="card controls-card mb-3">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-md-3">
            <label class="form-label text-warning">Item type</label>
            <div class="btn-group w-100">
              <button class="btn btn-sm pill" :class="{ active: itemKind === 'unique' }" @click="itemKind = 'unique'">Unique</button>
              <button class="btn btn-sm pill" :class="{ active: itemKind === 'set' }" @click="itemKind = 'set'">Set item</button>
              <button class="btn btn-sm pill" :class="{ active: itemKind === 'base' }" @click="itemKind = 'base'">Base item</button>
            </div>
          </div>
          <div class="col-md-5">
            <label class="form-label text-warning">Item</label>
            <SearchableSelect v-model="selectedItem" :options="itemOptions" placeholder="Search items..." />
          </div>
          <div class="col-md-4">
            <div class="form-check option-toggle">
              <input id="alldiff" v-model="allDifficulties" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="alldiff">All difficulties</label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="viewMode === 'item' && itemRows" class="card mb-4">
      <div class="card-header section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>Sources <span class="info-chip">{{ itemRows.length }} found</span></span>
        <span class="d-flex align-items-center gap-2">
          <button class="btn btn-sm pill" :class="{ active: chanceFormat === 'ratio' }" @click="chanceFormat = 'ratio'">1:N</button>
          <button class="btn btn-sm pill" :class="{ active: chanceFormat === 'pct' }" @click="chanceFormat = 'pct'">%</button>
        </span>
      </div>
      <div class="card-body p-2">
        <div v-if="itemRows.length === 0" class="empty-note p-3">No source drops this item with the current settings.</div>
        <div v-else class="table-responsive">
          <table class="table table-dark table-hover drop-table">
            <thead>
              <tr>
                <th>Monster</th>
                <th>Type</th>
                <th v-if="allDifficulties">Difficulty</th>
                <th>Area</th>
                <th class="text-end">mlvl</th>
                <th v-if="showItemVariantColumn" class="text-end">Exalted / Mythic</th>
                <th class="text-end">Chance</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in itemRows.slice(0, ITEM_ROW_LIMIT)"
                :key="index"
                class="clickable-row"
                title="Show this source's full drop table"
                @click="jumpToSource(row)"
              >
                <td>{{ row.monsterName }} <span v-if="row.terrorized" class="badge terror-badge ms-1">TZ</span></td>
                <td>{{ sourceTypeLabel(row) }}</td>
                <td v-if="allDifficulties">{{ DIFFICULTIES[row.difficulty] }}</td>
                <td>{{ row.areaId != null ? areaName(row.areaId) : '-' }}</td>
                <td class="text-end chance-cell">{{ row.mlvl }}</td>
                <td v-if="showItemVariantColumn" class="text-end chance-cell variant-cell">
                  <template v-if="row.variantChance != null">{{ fmt(row.variantChance) }}</template>
                  <template v-else>—</template>
                </td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="itemRows.length > ITEM_ROW_LIMIT" class="empty-note p-2">
            Showing the top {{ ITEM_ROW_LIMIT }} of {{ itemRows.length }} sources.
          </div>
        </div>
      </div>
    </div>

    <!-- Detail (color table for one base item) -->
    <div v-if="viewMode === 'source' && detail" class="card mb-3 detail-card">
      <div class="card-header section-header d-flex justify-content-between align-items-center">
        <span>
          {{ detail.base.Name }}
          <span class="info-chip">drop chance {{ fmt(detail.baseChance) }} · ilvl {{ detail.source.mlvl }}</span>
        </span>
        <button class="btn btn-sm pill" @click="detailBaseIndex = null">Close ×</button>
      </div>
      <div class="card-body p-2">
        <div class="table-responsive">
          <table class="table table-dark drop-table">
            <thead>
              <tr>
                <th>Quality</th>
                <th class="text-end">Relative</th>
                <th v-if="showDetailVariantColumn" class="text-end">Exalted / Mythic</th>
                <th class="text-end">Absolute</th>
                <th
                  v-for="n in CUMULATIVE_KILLS"
                  :key="n"
                  class="text-end cumulative-col"
                  :title="`Chance to see it at least once in ${n} drops`"
                >{{ n }}×</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in detail.uniqueRows" :key="'u' + row.name">
                <td><span class="name-unique">{{ row.name }}</span></td>
                <td class="text-end chance-cell">{{ formatChance(row.relative, 'pct') }}</td>
                <td v-if="showDetailVariantColumn" class="text-end chance-cell variant-cell">
                  <template v-if="row.variantChance != null">{{ fmt(row.variantChance) }}</template>
                  <template v-else>—</template>
                </td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
                <td v-for="n in CUMULATIVE_KILLS" :key="n" class="text-end chance-cell cumulative-col">
                  {{ formatChance(cumulative(row.chance, n), 'pct') }}
                </td>
              </tr>
              <tr v-for="row in detail.setRows" :key="'s' + row.name">
                <td><span class="name-set">{{ row.name }}</span> <span class="info-note">({{ row.setName }})</span></td>
                <td class="text-end chance-cell">{{ formatChance(row.relative, 'pct') }}</td>
                <td v-if="showDetailVariantColumn" class="text-end chance-cell variant-cell">
                  <template v-if="row.variantChance != null">{{ fmt(row.variantChance) }}</template>
                  <template v-else>—</template>
                </td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
                <td v-for="n in CUMULATIVE_KILLS" :key="n" class="text-end chance-cell cumulative-col">
                  {{ formatChance(cumulative(row.chance, n), 'pct') }}
                </td>
              </tr>
              <tr v-for="row in qualityRows" :key="row.label">
                <td>{{ row.label }}</td>
                <td class="text-end chance-cell">{{ formatChance(row.relative, 'pct') }}</td>
                <td v-if="showDetailVariantColumn" class="text-end">—</td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
                <td v-for="n in CUMULATIVE_KILLS" :key="n" class="text-end chance-cell cumulative-col">
                  {{ formatChance(cumulative(row.chance, n), 'pct') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Source info + results -->
    <div v-if="viewMode === 'source' && result && sourceInfo" class="card mb-4">
      <div class="card-header section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>
          Drops
          <span class="info-chip">mlvl {{ sourceInfo.mlvl }}</span>
          <span v-if="noDrop != null" class="info-chip" title="Chance that one pick of the treasure class drops nothing, after the player-count adjustment">
            no drop {{ formatChance(noDrop, 'pct') }}
          </span>
          <span v-if="sourceInfo.terrorized" class="badge terror-badge ms-1" :title="`Base mlvl ${sourceInfo.baseMlvl}`">Terrorized</span>
        </span>
        <span class="d-flex align-items-center gap-2 flex-wrap">
          <span class="info-note">
            TC: {{ sourceInfo.tcName }}
            <template v-if="sourceInfo.upgradedTcName !== sourceInfo.tcName"> → {{ sourceInfo.upgradedTcName }}</template>
          </span>
          <button class="btn btn-sm pill" :class="{ active: chanceFormat === 'ratio' }" @click="chanceFormat = 'ratio'">1:N</button>
          <button class="btn btn-sm pill" :class="{ active: chanceFormat === 'pct' }" @click="chanceFormat = 'pct'">%</button>
        </span>
      </div>
      <div class="card-body p-2">
        <div v-if="summary" class="summary-strip d-flex flex-wrap gap-3 px-2 pt-2">
          <span v-if="summary.unique > 0">
            Any unique: <strong>{{ fmt(summary.unique) }}</strong>
            <template v-if="summary.uniqueVariant > 0"> · exalted <strong>{{ fmt(summary.uniqueVariant) }}</strong></template>
          </span>
          <span v-if="summary.set > 0">
            Any set item: <strong>{{ fmt(summary.set) }}</strong>
            <template v-if="summary.setVariant > 0"> · mythic <strong>{{ fmt(summary.setVariant) }}</strong></template>
          </span>
          <span v-if="summary.rune > 0">Any rune: <strong>{{ fmt(summary.rune) }}</strong></span>
        </div>
        <div class="d-flex flex-wrap gap-2 p-2">
          <button
            v-for="f in [['all', 'All'], ['uniques', 'Uniques'], ['sets', 'Set items'], ['runes', 'Runes']]"
            :key="f[0]"
            class="btn btn-sm pill"
            :class="{ active: filterKind === f[0] }"
            @click="filterKind = f[0]"
          >{{ f[1] }}</button>
          <span class="ms-auto d-flex gap-2">
            <button class="btn btn-sm pill" :class="{ active: sortBy === 'chance' }" @click="setSort('chance')">By chance{{ sortArrow('chance') }}</button>
            <button class="btn btn-sm pill" :class="{ active: sortBy === 'name' }" @click="setSort('name')">By name{{ sortArrow('name') }}</button>
            <button v-if="filterKind === 'runes'" class="btn btn-sm pill" :class="{ active: sortBy === 'index' }" @click="setSort('index')">By index{{ sortArrow('index') }}</button>
          </span>
        </div>
        <div v-if="filteredRows.length === 0" class="empty-note p-3">
          No drops for this selection.
        </div>
        <div v-else class="table-responsive">
          <table class="table table-dark table-hover drop-table">
            <thead>
              <tr>
                <th>Item</th>
                <th
                  v-if="filterKind === 'runes' && runeChanceSum > 0"
                  class="text-end"
                  title="Chance that a dropped rune is this one"
                >Of rune drops</th>
                <th v-if="showVariantColumn" class="text-end">Exalted / Mythic</th>
                <th class="text-end">Chance</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, index) in filteredRows"
                :key="index"
                :class="['row-' + row.kind, { 'clickable-row': row.baseIndex >= 0 && !row.direct }]"
                :title="row.baseIndex >= 0 && !row.direct ? 'Show the detailed quality table for this base item' : undefined"
                @click="openDetail(row)"
              >
                <td class="name-cell">
                  <div
                    v-if="filterKind === 'runes' && maxRuneChance > 0"
                    class="rune-weight-bar"
                    :style="{ width: (row.chance / maxRuneChance * 100) + '%' }"
                  ></div>
                  <span
                    class="name-label"
                    :class="{ 'name-unique': row.kind === 'unique', 'name-set': row.kind === 'set' }"
                  >
                    {{ filterKind === 'runes' ? runeLabel(row.name) : rowLabel(row) }}
                  </span>
                </td>
                <td v-if="filterKind === 'runes' && runeChanceSum > 0" class="text-end chance-cell">
                  {{ fmt(row.chance / runeChanceSum) }}
                </td>
                <td v-if="showVariantColumn" class="text-end chance-cell variant-cell">
                  <template v-if="row.variantChance != null">{{ fmt(row.variantChance) }}</template>
                  <template v-else>—</template>
                </td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div v-else-if="viewMode === 'source'" class="empty-note p-3">
      Select a monster, superunique, chest, or treasure class to see drop chances.
    </div>
    <div v-else-if="viewMode === 'item' && !itemRows" class="empty-note p-3">
      Select an item to see which monsters drop it.
    </div>

    <div class="limitations-note mt-4">
      <strong>Notes:</strong>
      Chances follow the game formulas (treasure classes, NoDrop scaling with the player count,
      itemratio quality ladder, magic-find diminishing returns, rarity-weighted unique/set picks);
      multiple paths to the same item are added together, matching classic drop calculators.
      Terror Zones raise the monster level to character level +2/+4/+5 (capped per difficulty)
      and upgrade the treasure class accordingly.
      The mod ships a monstats.txt without desecrated treasure-class columns, so both data modes
      use the same monster data and the vanilla desecrated drop paths do not apply.
      Chests use each act's standard chest treasure class.
    </div>
  </div>
</template>

<style scoped>
/* the theme's .card clips overflow (rounded corners) - the select dropdowns
   need to escape the card */
.controls-card {
  overflow: visible;
}

.controls-card .pill {
  border: 1px solid rgba(201, 163, 106, 0.35);
  color: #e8ddc8;
  background: transparent;
}

.controls-card .pill.active,
.card .pill.active {
  background: rgba(94, 50, 0, 0.55);
  border-color: rgba(201, 163, 106, 0.8);
  color: #f4e5c3;
}

.card .pill {
  border: 1px solid rgba(201, 163, 106, 0.35);
  color: #e8ddc8;
  background: transparent;
}

.option-toggle .form-check-label {
  color: rgba(201, 163, 106, 0.95);
}

/* keep the row height stable when a toggle hides its input */
.option-hidden {
  visibility: hidden;
}

.info-note {
  color: rgba(232, 221, 200, 0.7);
  font-size: 0.9rem;
}

.info-chip {
  color: rgba(201, 163, 106, 0.9);
  font-size: 0.85rem;
  margin-left: 0.5rem;
}

.terror-badge {
  background: rgba(140, 30, 30, 0.8);
  color: #ffd7d7;
  font-size: 0.7rem;
}

.drop-table {
  margin-bottom: 0;
  font-size: 0.95rem;
}

.drop-table td, .drop-table th {
  background: transparent;
}

.name-unique {
  color: #c7b377;
}

.name-set {
  color: #58c458;
}

.row-base td {
  color: rgba(232, 221, 200, 0.85);
}

.chance-cell {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.variant-cell {
  color: rgba(201, 163, 106, 0.85);
}

.empty-note {
  color: rgba(232, 221, 200, 0.6);
}

.mode-pill {
  font-size: 0.95rem;
  padding: 0.35rem 1rem;
  border: 1px solid rgba(201, 163, 106, 0.55);
  color: #f0e3c4;
  background: rgba(26, 20, 16, 0.85);
}

.mode-pill:hover {
  border-color: rgba(201, 163, 106, 0.8);
  color: #f4e5c3;
}

.clickable-row {
  cursor: pointer;
}

.detail-card {
  border-color: rgba(201, 163, 106, 0.5);
}

.limitations-note {
  color: rgba(232, 221, 200, 0.55);
  font-size: 0.85rem;
  line-height: 1.5;
}

.summary-strip {
  color: rgba(232, 221, 200, 0.8);
  font-size: 0.9rem;
  border-bottom: 1px solid rgba(59, 42, 31, 0.8);
  padding-bottom: 0.5rem;
}

.summary-strip strong {
  color: #c9a36a;
  font-variant-numeric: tabular-nums;
}

/* rune frequency bars (same look as the affix calculator's group bars) */
.name-cell {
  position: relative;
}

.rune-weight-bar {
  position: absolute;
  left: 0;
  top: 10%;
  bottom: 10%;
  background: linear-gradient(90deg, rgba(201, 163, 106, 0.09), rgba(201, 163, 106, 0.03));
  border-left: 2px solid rgba(201, 163, 106, 0.35);
  pointer-events: none;
}

.name-label {
  position: relative;
}

.cumulative-col {
  color: rgba(232, 221, 200, 0.7);
  font-size: 0.88rem;
}
</style>
