<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import affixData from '@/assets/affixes.json';
import ReworkChanges from '@/components/ReworkChanges.vue';

const route = useRoute();
const router = useRouter();

// ---------- state ----------
const selectedCategory = ref('jewelry');
const selectedType = ref('ring');
const selectedBaseCode = ref('');
const ilvl = ref(99);
const quality = ref('rare');      // magic | rare | crafted
const dataMode = ref('mod');      // mod | vanilla (mod is the default)
const searchQuery = ref('');
const searchInput = ref('');
const expandedAffixes = ref(new Set());
const debounceTimeout = ref(null);

// ---------- static data ----------
const typeChains = affixData.TypeChains;
const typeNames = affixData.TypeNames;
const baseItems = affixData.BaseItems;

// Display names: itemtypes.txt names are sometimes off from what players see
// in game (e.g. lcha is "Large Charm" there but "Grand Charm" in game), so
// prefer the localized base-item name when a type has exactly one distinct one.
const baseNameByType = (() => {
  const map = {};
  baseItems.forEach(item => {
    if (!(item.Type in map)) map[item.Type] = new Set();
    map[item.Type].add(item.Name);
  });
  const result = {};
  Object.entries(map).forEach(([type, names]) => {
    if (names.size === 1) result[type] = [...names][0];
  });
  return result;
})();

const typeName = (code) => baseNameByType[code] ?? typeNames[code] ?? code;

// Categories mirror the classic reference calculator's grouping; membership
// is derived from the type hierarchy so mod-added types sort themselves in.
const CATEGORIES = [
  { id: 'jewelry', label: 'Jewelry' },
  { id: 'charms', label: 'Charms' },
  { id: 'armor', label: 'Armor' },
  { id: 'weapons', label: 'Weapons' },
];

const categoryOf = (code) => {
  const chain = new Set(typeChains[code] ?? [code]);
  if (chain.has('jewl') || chain.has('ring') || chain.has('amul')) return 'jewelry';
  if (chain.has('char')) return 'charms';
  if (chain.has('weap')) return 'weapons';
  if (chain.has('armo')) return 'armor';
  return null;
};

// Types directly named in any affix's allowlist - used to break display-name
// ties like "Jewel": cjwl derives from jewl but no affix targets cjwl itself.
const directlyReferencedTypes = (() => {
  const referenced = new Set();
  [...affixData.Prefixes, ...affixData.Suffixes].forEach(affix => {
    affix.AllowedTypes.forEach(t => referenced.add(t));
    (affix.VanillaAllowedTypes ?? []).forEach(t => referenced.add(t));
  });
  return referenced;
})();

// Selectable concrete types = types of actual base items, grouped by category.
// Types sharing a display name are deduped: directly affix-referenced types win.
const typesByCategory = computed(() => {
  const candidates = [];
  const seen = new Set();
  baseItems.forEach(item => {
    if (seen.has(item.Type)) return;
    seen.add(item.Type);
    const category = categoryOf(item.Type);
    if (category) {
      candidates.push({ type: item.Type, category });
    }
  });

  const byName = new Map();
  candidates.forEach(c => {
    const name = typeName(c.type);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(c);
  });

  const result = { jewelry: [], charms: [], armor: [], weapons: [] };
  byName.forEach(group => {
    const preferred = group.filter(c => directlyReferencedTypes.has(c.type));
    (preferred.length > 0 ? preferred : [group[0]]).forEach(c => result[c.category].push(c.type));
  });
  Object.values(result).forEach(list => list.sort((a, b) => typeName(a).localeCompare(typeName(b))));
  return result;
});

// Jewelry and charms have no meaningful base-item choice (qlvl 1 across the
// board), and charms can only ever spawn as magic items.
const hasBaseItemChoice = computed(() => !['jewelry', 'charms'].includes(selectedCategory.value));
const isCharmType = computed(() => (typeChains[selectedType.value] ?? []).includes('char'));

const basesOfType = computed(() =>
  baseItems.filter(item => item.Type === selectedType.value)
);

const selectedBase = computed(() =>
  basesOfType.value.find(item => item.Code === selectedBaseCode.value) ?? null
);

// ---------- affix level (community-known formula, not in the data guide) ----------
// Items with a magic lvl (circlets, wands, staves ...) add it directly;
// otherwise the base's qlvl reduces the effective affix level.
const alvl = computed(() => {
  const i = Math.min(Math.max(ilvl.value || 1, 1), 99);
  const base = selectedBase.value;
  if (!base) return i;
  if (base.MagicLvl > 0) return Math.min(i + base.MagicLvl, 99);
  const q = base.Qlvl;
  let result;
  if (q > i) result = i;
  else if (i > 99 - Math.floor(q / 2)) result = 2 * i - 99;
  else result = i - Math.floor(q / 2);
  return Math.min(Math.max(result, 1), 99);
});

// ---------- mode-aware field access ----------
// In vanilla mode reworked affixes resolve their Vanilla* value; everything
// (eligibility, chances, display) runs through this one helper so both modes
// stay fully consistent.
const fieldOf = (affix, name) =>
  dataMode.value === 'vanilla' ? (affix['Vanilla' + name] ?? affix[name]) : affix[name];

// ---------- eligibility ----------
const chainOfSelected = computed(() => new Set(typeChains[selectedType.value] ?? [selectedType.value]));

const isEligible = (affix) => {
  if (dataMode.value === 'mod' && affix.VanillaOnly) return false;
  const frequency = fieldOf(affix, 'Frequency');
  if (!frequency || frequency <= 0) return false;
  if (quality.value !== 'magic' && !fieldOf(affix, 'Rare')) return false;
  const level = fieldOf(affix, 'Level');
  const maxLevel = fieldOf(affix, 'MaxLevel');
  if (alvl.value < level) return false;
  if (maxLevel != null && alvl.value > maxLevel) return false;
  const chain = chainOfSelected.value;
  if (!fieldOf(affix, 'AllowedTypes').some(t => chain.has(t))) return false;
  if (fieldOf(affix, 'ExcludedTypes').some(t => chain.has(t))) return false;
  return true;
};

const matchesSearch = (affix) => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return true;
  if (affix.Name.toLowerCase().includes(query)) return true;
  return fieldOf(affix, 'Properties').some(p => (p.Description ?? '').toLowerCase().includes(query));
};

const buildPool = (list) => {
  const eligible = list.filter(isEligible);
  const totalFrequency = eligible.reduce((sum, a) => sum + fieldOf(a, 'Frequency'), 0);
  const visible = eligible.filter(matchesSearch);

  // group -> tier list, ordered like the data files (group by ascending level)
  const groups = new Map();
  visible.forEach(affix => {
    const group = affix.Group || '0';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(affix);
  });
  const groupList = [...groups.entries()].map(([group, affixes]) => ({
    group,
    affixes: affixes.slice().sort((a, b) => fieldOf(a, 'Level') - fieldOf(b, 'Level')),
    groupFrequency: affixes.reduce((sum, a) => sum + fieldOf(a, 'Frequency'), 0),
    minRow: Math.min(...affixes.map(a => a.RowIndex)),
  })).sort((a, b) => a.minRow - b.minRow);

  return { eligible, visible, totalFrequency, groups: groupList };
};

const prefixPool = computed(() => buildPool(affixData.Prefixes));
const suffixPool = computed(() => buildPool(affixData.Suffixes));

const chanceOf = (affix, pool) =>
  pool.totalFrequency > 0 ? (fieldOf(affix, 'Frequency') / pool.totalFrequency) * 100 : 0;

const formatChance = (value) => value >= 10 ? value.toFixed(1) : value.toFixed(2);

// ---------- rework display ----------
const getReworkChanges = (affix) => {
  const changes = [];

  if (affix.VanillaProperties) {
    const key = p => `${p.Prop}|${p.Par}`;
    const oldMap = new Map(affix.VanillaProperties.map(p => [key(p), p]));
    const newMap = new Map(affix.Properties.map(p => [key(p), p]));
    for (const [k, np] of newMap) {
      const op = oldMap.get(k);
      if (!op) changes.push({ old: null, new: np.Description });
      else if (op.Description !== np.Description) changes.push({ old: op.Description, new: np.Description });
    }
    for (const [k, op] of oldMap) {
      if (!newMap.has(k)) changes.push({ old: op.Description, new: null });
    }
  }

  const numericChange = (label, name) => {
    if (affix['Vanilla' + name] !== undefined) {
      changes.push({ label, old: String(affix['Vanilla' + name]), new: String(affix[name]) });
    }
  };
  numericChange('Affix level', 'Level');
  numericChange('Max level', 'MaxLevel');
  numericChange('Level req', 'LevelReq');
  numericChange('Frequency', 'Frequency');

  if (affix.VanillaAllowedTypes) {
    changes.push({
      label: 'Item types',
      old: affix.VanillaAllowedTypes.map(typeName).join(', '),
      new: affix.AllowedTypes.map(typeName).join(', '),
    });
  }
  if (affix.VanillaOnly) {
    changes.push({ label: 'Availability', old: 'available in vanilla', new: 'disabled by the mod' });
  }

  return changes;
};

// ---------- interaction ----------
const setCategory = (category) => {
  selectedCategory.value = category;
  const types = typesByCategory.value[category];
  if (!types.includes(selectedType.value)) {
    setType(types[0] ?? '');
  } else if (isCharmType.value) {
    quality.value = 'magic';
  }
};

const setType = (type) => {
  selectedType.value = type;
  selectedBaseCode.value = '';
  if (isCharmType.value) {
    quality.value = 'magic';
  }
};

const affixKey = (affix, kind) => `${kind}-${affix.RowIndex}`;

const toggleAffix = (affix, kind) => {
  const key = affixKey(affix, kind);
  if (expandedAffixes.value.has(key)) expandedAffixes.value.delete(key);
  else expandedAffixes.value.add(key);
};

const handleSearch = (event) => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    searchQuery.value = event.target.value;
  }, 300);
};

// ---------- shareable URL state (hash-router compatible) ----------
onMounted(() => {
  const q = route.query;
  if (q.type && typeChains[q.type]) {
    selectedType.value = q.type;
    selectedCategory.value = categoryOf(q.type) ?? selectedCategory.value;
  }
  if (q.base) selectedBaseCode.value = q.base;
  if (q.ilvl && !isNaN(+q.ilvl)) ilvl.value = Math.min(Math.max(+q.ilvl, 1), 99);
  if (['magic', 'rare', 'crafted'].includes(q.quality)) quality.value = q.quality;
  if (['mod', 'vanilla'].includes(q.data)) dataMode.value = q.data;
  if (isCharmType.value) quality.value = 'magic';
});

watch([selectedType, selectedBaseCode, ilvl, quality, dataMode], () => {
  router.replace({
    query: {
      type: selectedType.value,
      ...(selectedBaseCode.value ? { base: selectedBaseCode.value } : {}),
      ...(ilvl.value !== 99 ? { ilvl: String(ilvl.value) } : {}),
      ...(quality.value !== 'rare' ? { quality: quality.value } : {}),
      ...(dataMode.value !== 'mod' ? { data: dataMode.value } : {}),
    },
  });
});
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">✦</span>
          Affix Calculator
          <span class="title-icon">✦</span>
        </h1>
      </div>
    </div>

    <!-- Controls -->
    <div class="card controls-card mb-4">
      <div class="card-body">
        <!-- category + type -->
        <div class="mb-3">
          <div class="d-flex flex-wrap gap-2 mb-2">
            <button
              v-for="category in CATEGORIES"
              :key="category.id"
              class="btn btn-sm pill"
              :class="{ active: selectedCategory === category.id }"
              @click="setCategory(category.id)"
            >{{ category.label }}</button>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              v-for="type in typesByCategory[selectedCategory]"
              :key="type"
              class="btn btn-sm pill pill-type"
              :class="{ active: selectedType === type }"
              @click="setType(type)"
            >{{ typeName(type) }}</button>
          </div>
        </div>

        <div class="row g-3 align-items-end">
          <!-- base item (weapons/armor only - jewelry and charms are all qlvl 1) -->
          <div v-if="hasBaseItemChoice" class="col-md-4">
            <label class="form-label text-warning">Base item (sets qlvl)</label>
            <select v-model="selectedBaseCode" class="form-select">
              <option value="">Any {{ typeName(selectedType) }} (qlvl 0)</option>
              <option v-for="base in basesOfType" :key="base.Code" :value="base.Code">
                {{ base.Name }} (qlvl {{ base.Qlvl }}{{ base.MagicLvl ? `, +${base.MagicLvl} mlvl` : '' }})
              </option>
            </select>
          </div>

          <!-- ilvl -->
          <div class="col-md-2">
            <label class="form-label text-warning">Item level</label>
            <input v-model.number="ilvl" type="number" min="1" max="99" class="form-control" />
          </div>

          <!-- quality -->
          <div class="col-md-3">
            <label class="form-label text-warning">Quality</label>
            <div class="btn-group w-100" :title="isCharmType ? 'Charms only spawn as magic items' : undefined">
              <button
                v-for="option in ['magic', 'rare', 'crafted']"
                :key="option"
                class="btn btn-sm pill"
                :class="{ active: quality === option }"
                :disabled="isCharmType && option !== 'magic'"
                @click="quality = option"
              >{{ option.charAt(0).toUpperCase() + option.slice(1) }}</button>
            </div>
          </div>

          <!-- data mode -->
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
          <div class="col-md-6">
            <input
              type="text"
              class="form-control"
              placeholder="Search affixes by name or stat..."
              :value="searchInput"
              @input="handleSearch"
            />
          </div>
          <div class="col-md-6 text-md-end alvl-note">
            Effective affix level: <strong>{{ alvl }}</strong>
            <span v-if="selectedBase && selectedBase.MagicLvl > 0"> (ilvl + {{ selectedBase.MagicLvl }} magic lvl)</span>
            <span v-else-if="selectedBase"> (ilvl {{ ilvl }}, qlvl {{ selectedBase.Qlvl }})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Results -->
    <div class="row g-4">
      <div v-for="[kind, pool] in [['prefix', prefixPool], ['suffix', suffixPool]]" :key="kind" class="col-lg-6">
        <div class="card h-100">
          <div class="card-header section-header d-flex justify-content-between align-items-center">
            <span>{{ kind === 'prefix' ? 'Prefixes' : 'Suffixes' }}</span>
            <span class="pool-count">{{ pool.eligible.length }} possible</span>
          </div>
          <div class="card-body p-2">
            <div v-if="pool.groups.length === 0" class="empty-note p-3">
              No {{ kind === 'prefix' ? 'prefixes' : 'suffixes' }} match the current selection.
            </div>
            <div v-for="groupEntry in pool.groups" :key="groupEntry.group" class="affix-group mb-2">
              <div class="affix-group-header d-flex justify-content-between align-items-baseline">
                <span>Group {{ groupEntry.group }}<span v-if="groupEntry.affixes.length > 1" class="group-note"> · one of these</span></span>
                <span class="group-note">Σ freq {{ groupEntry.groupFrequency }}</span>
              </div>
              <div
                v-for="affix in groupEntry.affixes"
                :key="affix.RowIndex"
                class="affix-row"
                :class="{ expanded: expandedAffixes.has(affixKey(affix, kind)) }"
                @click="toggleAffix(affix, kind)"
              >
                <div
                  v-if="groupEntry.affixes.length > 1"
                  class="group-weight-bar"
                  :style="{ width: (fieldOf(affix, 'Frequency') / groupEntry.groupFrequency * 100) + '%' }"
                ></div>
                <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2">
                  <span class="affix-name">
                    {{ affix.Name }}
                    <span v-if="affix.IsReworked" class="badge rework-badge ms-1">Reworked</span>
                    <span v-if="affix.ClassSpecific" class="badge class-badge ms-1">{{ affix.ClassSpecific }}</span>
                  </span>
                  <span class="affix-meta">
                    alvl {{ fieldOf(affix, 'Level') }}
                    · req {{ fieldOf(affix, 'LevelReq') }}
                    <template v-if="groupEntry.affixes.length > 1">
                      · in group {{ formatChance(fieldOf(affix, 'Frequency') / groupEntry.groupFrequency * 100) }}%
                    </template>
                    · roll {{ formatChance(chanceOf(affix, pool)) }}%
                  </span>
                </div>
                <div class="affix-props">
                  <div v-for="(prop, propIndex) in fieldOf(affix, 'Properties')" :key="propIndex">
                    {{ prop.Description }}
                  </div>
                </div>
                <div v-if="expandedAffixes.has(affixKey(affix, kind))" class="affix-details" @click.stop>
                  <div class="detail-line">
                    Frequency {{ fieldOf(affix, 'Frequency') }}
                    <span v-if="fieldOf(affix, 'MaxLevel') != null"> · disappears above alvl {{ fieldOf(affix, 'MaxLevel') }}</span>
                    <span v-if="!fieldOf(affix, 'Rare')"> · magic only</span>
                  </div>
                  <div class="detail-line">
                    Types: {{ fieldOf(affix, 'AllowedTypes').map(typeName).join(', ') }}
                    <span v-if="fieldOf(affix, 'ExcludedTypes').length"> — except {{ fieldOf(affix, 'ExcludedTypes').map(typeName).join(', ') }}</span>
                  </div>
                  <ReworkChanges v-if="affix.IsReworked" :changes="getReworkChanges(affix)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls-card .pill {
  border: 1px solid rgba(201, 163, 106, 0.35);
  color: var(--d2r-text);
  background: transparent;
}

.controls-card .pill.active {
  background: rgba(201, 163, 106, 0.2);
  color: var(--d2r-gold);
  border-color: rgba(201, 163, 106, 0.6);
}

.alvl-note {
  color: rgba(194, 176, 143, 0.8);
}

.pool-count {
  font-size: 0.8rem;
  color: rgba(194, 176, 143, 0.7);
}

.affix-group {
  border: 1px solid rgba(59, 42, 31, 0.6);
  border-radius: 10px;
  background: rgba(24, 18, 12, 0.35);
  padding-bottom: 0.25rem;
  overflow: hidden;
}

.affix-group-header {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(194, 176, 143, 0.65);
  padding: 0.4rem 0.75rem 0.3rem;
  border-bottom: 1px solid rgba(59, 42, 31, 0.5);
  background: rgba(30, 22, 15, 0.6);
}

.group-note {
  text-transform: none;
  letter-spacing: 0.05em;
  color: rgba(194, 176, 143, 0.5);
}

.affix-row {
  position: relative;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.group-weight-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(201, 163, 106, 0.09), rgba(201, 163, 106, 0.03));
  border-left: 2px solid rgba(201, 163, 106, 0.35);
  pointer-events: none;
}

.affix-row:hover,
.affix-row.expanded {
  background: rgba(201, 163, 106, 0.08);
}

.affix-name {
  color: var(--d2r-gold);
}

.affix-meta {
  font-size: 0.78rem;
  color: rgba(194, 176, 143, 0.7);
  white-space: nowrap;
}

.affix-props {
  font-size: 0.85rem;
  color: #6969ff; /* classic D2 magic-blue for rolled stats */
}

.affix-details {
  margin-top: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px solid rgba(59, 42, 31, 0.8);
  cursor: default;
}

.detail-line {
  font-size: 0.8rem;
  color: rgba(194, 176, 143, 0.75);
}

.class-badge {
  background: rgba(105, 105, 255, 0.15);
  color: #9c9cff;
  border: 1px solid rgba(105, 105, 255, 0.4);
}

.empty-note {
  color: rgba(194, 176, 143, 0.6);
}
</style>
