<script setup>
import { ref, computed, watch } from 'vue';
import dropData from '@/assets/dropcalc.json';
import SearchableSelect from '@/components/SearchableSelect.vue';
import {
  buildContext, computeMonsterDrops, formatChance, playerBonus, DIFFICULTIES,
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
const sourceKind = ref('monster'); // monster | superunique | chest | rawTc
const sourceType = ref('normal'); // normal | champion | unique | minion | quest
const selectedMonster = ref(null);
const selectedSuperUnique = ref(null);
const selectedAreaId = ref(null);
const selectedTc = ref(null);

// ---------- results view ----------
const filterKind = ref('all'); // all | uniques | sets | runes
const sortBy = ref('chance'); // chance | name

const ctx = computed(() => buildContext(dropData, {
  dataMode: dataMode.value,
  players: players.value,
  partyNearby: party.value,
  mf: mf.value,
  terror: { enabled: terrorEnabled.value, charLevel: charLevel.value },
  exalted: { enabled: exaltedEnabled.value && dataMode.value === 'mod', percent: exaltedPercent.value },
  mythic: { enabled: mythicEnabled.value && dataMode.value === 'mod', percent: mythicPercent.value },
}));

const bonus = computed(() => playerBonus(players.value, party.value));

// ---------- pickers ----------
const monsterOptions = computed(() => {
  const nameCounts = new Map();
  dropData.Monsters.forEach(m => nameCounts.set(m.Name, (nameCounts.get(m.Name) ?? 0) + 1));
  return dropData.Monsters
    .map((m, index) => ({
      value: index,
      label: nameCounts.get(m.Name) > 1 ? `${m.Name} (${m.Id})` : m.Name,
      hint: `mlvl ${m.Levels[difficulty.value]}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const superUniqueOptions = computed(() =>
  dropData.SuperUniques
    .map((su, index) => ({ value: index, label: su.Name, hint: areaName(su.Areas[0]) }))
    .sort((a, b) => a.label.localeCompare(b.label)));

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
  if (sourceKind.value === 'superunique' && selectedSuperUnique.value != null) {
    return { kind: 'superunique', superUniqueIndex: selectedSuperUnique.value, difficulty: difficulty.value };
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

const showExaltedColumn = computed(() =>
  dataMode.value === 'mod' && exaltedEnabled.value);
const showMythicColumn = computed(() =>
  dataMode.value === 'mod' && mythicEnabled.value);
const showVariantColumn = computed(() => showExaltedColumn.value || showMythicColumn.value);

const filteredRows = computed(() => {
  if (!result.value) return [];
  let rows = result.value.rows;
  if (filterKind.value === 'uniques') rows = rows.filter(r => r.kind === 'unique');
  else if (filterKind.value === 'sets') rows = rows.filter(r => r.kind === 'set');
  else if (filterKind.value === 'runes') rows = rows.filter(r => r.kind === 'base' && r.isRune);
  if (sortBy.value === 'name') {
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  return rows;
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
              v-if="terrorEnabled"
              v-model.number="charLevel"
              type="number" min="1" max="99"
              class="form-control form-control-sm mt-1"
              title="Character level of the game creator"
            />
          </div>
          <div v-if="dataMode === 'mod'" class="col-md-3">
            <div class="form-check option-toggle">
              <input id="exalted" v-model="exaltedEnabled" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="exalted">Exalted uniques</label>
            </div>
            <div v-if="exaltedEnabled" class="input-group input-group-sm mt-1">
              <input v-model.number="exaltedPercent" type="number" min="1" max="99" class="form-control" />
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div v-if="dataMode === 'mod'" class="col-md-3">
            <div class="form-check option-toggle">
              <input id="mythic" v-model="mythicEnabled" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="mythic">Mythic set items</label>
            </div>
            <div v-if="mythicEnabled" class="input-group input-group-sm mt-1">
              <input v-model.number="mythicPercent" type="number" min="1" max="99" class="form-control" />
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div class="col-md-3 text-md-end info-note">
            Player bonus: <strong>{{ bonus }}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Source -->
    <div class="card controls-card mb-3">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'monster' }" @click="sourceKind = 'monster'">Monster</button>
          <button class="btn btn-sm pill" :class="{ active: sourceKind === 'superunique' }" @click="sourceKind = 'superunique'">Superunique / Boss Pack</button>
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
              <label class="form-label text-warning">Superunique</label>
              <SearchableSelect v-model="selectedSuperUnique" :options="superUniqueOptions" placeholder="Search superuniques..." />
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

    <!-- Source info + results -->
    <div v-if="result && sourceInfo" class="card mb-4">
      <div class="card-header section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>
          Drops
          <span class="info-chip">mlvl {{ sourceInfo.mlvl }}</span>
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
        <div class="d-flex flex-wrap gap-2 p-2">
          <button
            v-for="f in [['all', 'All'], ['uniques', 'Uniques'], ['sets', 'Set items'], ['runes', 'Runes']]"
            :key="f[0]"
            class="btn btn-sm pill"
            :class="{ active: filterKind === f[0] }"
            @click="filterKind = f[0]"
          >{{ f[1] }}</button>
          <span class="ms-auto d-flex gap-2">
            <button class="btn btn-sm pill" :class="{ active: sortBy === 'chance' }" @click="sortBy = 'chance'">By chance</button>
            <button class="btn btn-sm pill" :class="{ active: sortBy === 'name' }" @click="sortBy = 'name'">By name</button>
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
                <th class="text-end">Chance</th>
                <th v-if="showVariantColumn" class="text-end">Exalted / Mythic</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in filteredRows" :key="index" :class="'row-' + row.kind">
                <td>
                  <span :class="{ 'name-unique': row.kind === 'unique', 'name-set': row.kind === 'set' }">
                    {{ rowLabel(row) }}
                  </span>
                </td>
                <td class="text-end chance-cell">{{ fmt(row.chance) }}</td>
                <td v-if="showVariantColumn" class="text-end chance-cell variant-cell">
                  <template v-if="row.variantChance != null">{{ fmt(row.variantChance) }}</template>
                  <template v-else>—</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div v-else class="empty-note p-3">
      Select a monster, superunique, chest, or treasure class to see drop chances.
    </div>
  </div>
</template>

<style scoped>
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
</style>
