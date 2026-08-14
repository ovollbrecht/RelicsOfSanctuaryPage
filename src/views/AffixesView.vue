<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import affixData from '@/assets/affixes.json';
import ReworkChanges from '@/components/ReworkChanges.vue';
import { magicChance, rareCraftedChance } from '@/composables/useAffixSimulation.js';

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
const onlyReworked = ref(false);

// Sticky controls: auto-collapse to a summary row while scrolled, with a
// manual chevron override.
const isScrolled = ref(false);
const forceOpen = ref(false);
const controlsCollapsed = computed(() => isScrolled.value && !forceOpen.value);
const onScroll = () => {
  const scrolled = window.scrollY > 260;
  if (scrolled !== isScrolled.value) {
    isScrolled.value = scrolled;
    if (!scrolled) forceOpen.value = false;
  }
};
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // the page may load pre-scrolled (scroll restoration)
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));

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
  if (onlyReworked.value && !affix.IsReworked) return false;
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

// ---------- wanted-affix spawn chance ----------
const pinnedIds = ref(new Set()); // ids like "prefix-123" / "suffix-456"

const pinId = (affix, kind) => `${kind}-${affix.RowIndex}`;
const isPinned = (affix, kind) => pinnedIds.value.has(pinId(affix, kind));

const togglePin = (affix, kind) => {
  const id = pinId(affix, kind);
  const next = new Set(pinnedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  pinnedIds.value = next;
};

const clearPins = () => { pinnedIds.value = new Set(); };

const affixById = (() => {
  const map = new Map();
  affixData.Prefixes.forEach(a => map.set(`prefix-${a.RowIndex}`, { affix: a, kind: 'prefix' }));
  affixData.Suffixes.forEach(a => map.set(`suffix-${a.RowIndex}`, { affix: a, kind: 'suffix' }));
  return map;
})();

const pinnedList = computed(() =>
  [...pinnedIds.value]
    .map(id => ({ id, ...affixById.get(id) }))
    .filter(entry => entry.affix)
);

const wantedChance = computed(() => {
  if (pinnedIds.value.size === 0) return null;

  const toEnginePool = (pool, kind) => pool.eligible.map(a => ({
    id: pinId(a, kind),
    group: `${kind}-${a.Group || '0'}`,
    frequency: fieldOf(a, 'Frequency'),
  }));
  const prefixes = toEnginePool(prefixPool.value, 'prefix');
  const suffixes = toEnginePool(suffixPool.value, 'suffix');
  const eligibleIds = new Set([...prefixes, ...suffixes].map(e => e.id));

  const unavailable = pinnedList.value.filter(p => !eligibleIds.has(p.id));
  if (unavailable.length > 0) {
    return { chance: 0, unavailable: unavailable.map(p => p.affix.Name), approximate: false };
  }

  // pins in the same affix group = "any of these"; different groups must ALL hit
  const selections = new Map();
  pinnedList.value.forEach(p => {
    const groupKey = `${p.kind}-${p.affix.Group || '0'}`;
    if (!selections.has(groupKey)) selections.set(groupKey, { kind: p.kind, ids: new Set() });
    selections.get(groupKey).ids.add(p.id);
  });
  const wantedSelections = [...selections.values()];

  if (quality.value === 'magic') {
    const prefixGroups = wantedSelections.filter(s => s.kind === 'prefix');
    const suffixGroups = wantedSelections.filter(s => s.kind === 'suffix');
    if (prefixGroups.length > 1 || suffixGroups.length > 1) {
      return { chance: 0, impossible: 'Magic items can get at most one prefix and one suffix.', approximate: false };
    }
    const chance = magicChance({
      prefixes,
      suffixes,
      wantedPrefixIds: prefixGroups[0]?.ids ?? new Set(),
      wantedSuffixIds: suffixGroups[0]?.ids ?? new Set(),
    });
    return { chance, approximate: false };
  }

  const prefixSelections = wantedSelections.filter(s => s.kind === 'prefix');
  const suffixSelections = wantedSelections.filter(s => s.kind === 'suffix');
  if (prefixSelections.length > 3 || suffixSelections.length > 3) {
    return { chance: 0, impossible: 'At most 3 prefixes and 3 suffixes are possible.', approximate: false };
  }

  const chance = rareCraftedChance({
    prefixes,
    suffixes,
    wantedSelections: wantedSelections.map(s => s.ids),
    quality: quality.value,
    ilvl: Math.min(Math.max(ilvl.value || 1, 1), 99),
    isJewel: chainOfSelected.value.has('jewl'),
  });
  return { chance, approximate: true };
});

const formatWantedChance = (chance) => {
  if (chance <= 0) return '0%';
  const pct = chance * 100;
  const formatted = pct >= 1 ? pct.toFixed(2) : pct >= 0.01 ? pct.toFixed(3) : pct.toExponential(2);
  const oneIn = Math.round(1 / chance);
  return `${formatted}% (≈ 1 in ${oneIn.toLocaleString('en-US')})`;
};

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

const setAllExpanded = (pool, kind, expanded) => {
  const next = new Set(expandedAffixes.value);
  pool.visible.forEach(affix => {
    const key = affixKey(affix, kind);
    if (expanded) next.add(key);
    else next.delete(key);
  });
  expandedAffixes.value = next;
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
  if (q.pins) {
    pinnedIds.value = new Set(String(q.pins).split('.').filter(id => affixById.has(id)));
  }
});

watch([selectedType, selectedBaseCode, ilvl, quality, dataMode, pinnedIds], () => {
  router.replace({
    query: {
      type: selectedType.value,
      ...(selectedBaseCode.value ? { base: selectedBaseCode.value } : {}),
      ...(ilvl.value !== 99 ? { ilvl: String(ilvl.value) } : {}),
      ...(quality.value !== 'rare' ? { quality: quality.value } : {}),
      ...(dataMode.value !== 'mod' ? { data: dataMode.value } : {}),
      ...(pinnedIds.value.size > 0 ? { pins: [...pinnedIds.value].join('.') } : {}),
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

    <!-- Controls (sticky; collapses to a summary bar while scrolled) -->
    <div class="card controls-card sticky-controls mb-4">
      <div v-if="controlsCollapsed" class="card-body compact-bar d-flex align-items-center flex-wrap gap-2">
        <span class="compact-summary">
          {{ typeName(selectedType) }} · ilvl {{ ilvl }} · {{ quality }} ·
          {{ dataMode === 'mod' ? 'Relics of Sanctuary' : 'Vanilla' }}
        </span>
        <input
          type="text"
          class="form-control form-control-sm compact-search"
          placeholder="Search affixes..."
          :value="searchInput"
          @input="handleSearch"
        />
        <button class="btn btn-sm pill" @click="forceOpen = true">Edit filters</button>
      </div>
      <div v-else class="card-body">
        <button
          v-if="isScrolled"
          class="btn btn-sm pill controls-collapse-btn"
          title="Collapse filters"
          @click="forceOpen = false"
        >Collapse ▲</button>
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
          <div class="col-md-5">
            <input
              type="text"
              class="form-control"
              placeholder="Search affixes by name or stat..."
              :value="searchInput"
              @input="handleSearch"
            />
          </div>
          <div class="col-md-3">
            <div class="form-check reworked-toggle">
              <input id="only-reworked" v-model="onlyReworked" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="only-reworked">
                {{ dataMode === 'vanilla' ? 'Only changed by mod' : 'Only reworked' }}
              </label>
            </div>
          </div>
          <div class="col-md-4 text-md-end alvl-note">
            Effective affix level: <strong>{{ alvl }}</strong>
            <span v-if="selectedBase && selectedBase.MagicLvl > 0"> (ilvl + {{ selectedBase.MagicLvl }} magic lvl)</span>
            <span v-else-if="selectedBase"> (ilvl {{ ilvl }}, qlvl {{ selectedBase.Qlvl }})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Wanted affixes / spawn chance -->
    <div v-if="pinnedList.length > 0" class="card wanted-card mb-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-baseline flex-wrap gap-2 mb-2">
          <span class="section-header mb-0">Wanted affixes</span>
          <button class="btn btn-sm pill" @click="clearPins">Clear all</button>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <span v-for="pin in pinnedList" :key="pin.id" class="badge wanted-pin">
            {{ pin.kind === 'prefix' ? '⟨P⟩' : '⟨S⟩' }} {{ pin.affix.Name }}
            <button class="pin-remove" @click="togglePin(pin.affix, pin.kind)" aria-label="Remove">×</button>
          </span>
        </div>
        <div v-if="wantedChance" class="wanted-result">
          <template v-if="wantedChance.impossible">
            <span class="wanted-impossible">Impossible: {{ wantedChance.impossible }}</span>
          </template>
          <template v-else-if="wantedChance.unavailable">
            <span class="wanted-impossible">
              Not available with the current item/level settings: {{ wantedChance.unavailable.join(', ') }}
            </span>
          </template>
          <template v-else>
            Chance per {{ quality }} roll:
            <strong>{{ wantedChance.approximate ? '≈ ' : '' }}{{ formatWantedChance(wantedChance.chance) }}</strong>
            <span v-if="wantedChance.approximate" class="wanted-note"> · simulated (100k rolls)</span>
          </template>
        </div>
        <div class="wanted-note mt-1">
          Pins in the same affix group count as "any of these"; different groups must all appear.
        </div>
      </div>
    </div>

    <!-- Results -->
    <div class="row g-4">
      <div v-for="[kind, pool] in [['prefix', prefixPool], ['suffix', suffixPool]]" :key="kind" class="col-lg-6">
        <div class="card h-100">
          <div class="card-header section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span>{{ kind === 'prefix' ? 'Prefixes' : 'Suffixes' }}</span>
            <span class="d-flex align-items-center gap-2">
              <button class="btn btn-sm pill expand-btn" @click="setAllExpanded(pool, kind, true)">Expand all</button>
              <button class="btn btn-sm pill expand-btn" @click="setAllExpanded(pool, kind, false)">Collapse all</button>
              <span class="pool-count">{{ pool.eligible.length }} possible</span>
            </span>
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
                    <button
                      class="pin-btn"
                      :class="{ pinned: isPinned(affix, kind) }"
                      :title="isPinned(affix, kind) ? 'Remove from wanted affixes' : 'Add to wanted affixes'"
                      @click.stop="togglePin(affix, kind)"
                    >{{ isPinned(affix, kind) ? '★' : '☆' }}</button>
                    {{ affix.Name }}
                    <span v-if="affix.IsReworked && dataMode === 'mod'" class="badge rework-badge ms-1">Reworked</span>
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
                  <ReworkChanges
                    v-if="affix.IsReworked"
                    :changes="getReworkChanges(affix)"
                    :title="dataMode === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla'"
                  />
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
.sticky-controls {
  position: sticky;
  top: 0;
  z-index: 100;
  /* fully opaque so scrolled content cannot bleed through the pinned card */
  background: linear-gradient(180deg, rgb(26, 20, 16), rgb(16, 12, 10));
}

/* keep the compact summary clear of the floating menu button */
@media (max-width: 1199px) {
  .compact-bar {
    padding-left: 3.5rem;
  }
}

.sticky-controls .card-body {
  position: relative;
}

.controls-collapse-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.compact-bar {
  padding: 0.5rem 0.75rem;
}

.compact-summary {
  color: var(--d2-gold, #c9a36a);
  font-size: 0.9rem;
  white-space: nowrap;
}

.compact-search {
  max-width: 16rem;
  flex: 1 1 10rem;
}

.reworked-toggle .form-check-label {
  color: var(--d2-gold, #c9a36a);
  font-size: 0.9rem;
}

.expand-btn {
  font-size: 0.75rem;
  padding: 0.1rem 0.5rem;
}

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

.pin-btn {
  background: none;
  border: none;
  color: rgba(201, 163, 106, 0.5);
  cursor: pointer;
  padding: 0 0.15rem;
  font-size: 1rem;
  line-height: 1;
}

.pin-btn:hover {
  color: var(--d2r-gold-bright);
}

.pin-btn.pinned {
  color: var(--d2r-gold-bright);
}

.wanted-card {
  border-color: rgba(201, 163, 106, 0.45);
}

.wanted-pin {
  background: rgba(201, 163, 106, 0.15);
  color: var(--d2r-text);
  border: 1px solid rgba(201, 163, 106, 0.4);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.pin-remove {
  background: none;
  border: none;
  color: rgba(194, 176, 143, 0.8);
  cursor: pointer;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
}

.pin-remove:hover {
  color: var(--d2r-gold-bright);
}

.wanted-result {
  font-size: 1.05rem;
  color: var(--d2r-text);
}

.wanted-result strong {
  color: var(--d2r-gold-bright);
}

.wanted-impossible {
  color: #d08770;
}

.wanted-note {
  font-size: 0.8rem;
  color: rgba(194, 176, 143, 0.6);
}
</style>
