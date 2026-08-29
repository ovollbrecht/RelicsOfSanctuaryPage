<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';
import RunewordTable from '@/components/RunewordTable.vue';

const runewords = ref([]);
const searchQuery = ref('');
const runesSearchQuery = ref('');
const selectedCategory = ref('all');
const dataMode = ref('mod'); // mod | vanilla (mod is the default)

// Mode-aware field access: vanilla mode resolves the embedded Vanilla* value
// for reworked runewords; new (mod-added) runewords stay visible either way.
const fieldOf = (runeword, name) =>
  dataMode.value === 'vanilla' ? (runeword['Vanilla' + name] ?? runeword[name]) : runeword[name];
const debounceTimeout = ref(null);
const itemsSection = ref(null);
const onlyReworked = ref(false);

const visibleRunewords = computed(() =>
  onlyReworked.value ? runewords.value.filter(runeword => runeword.IsReworked) : runewords.value
);

// Group runewords by category
const categorizedRunewords = computed(() => {
  const result = {
    new: [],
    weapons: [],
    armors: [],
    helmets: [],
    shields: []
  };

  visibleRunewords.value.forEach(runeword => {
    if (runeword.IsNew) {
      result.new.push(runeword);
    }
    if (runeword.IsWeapon) {
      result.weapons.push(runeword);
    }
    if (runeword.IsTorso) {
      result.armors.push(runeword);
    }
    if (runeword.IsHelmet) {
      result.helmets.push(runeword);
    }
    if (runeword.IsShield) {
      result.shields.push(runeword);
    }
  });

  return result;
});

// Filter runewords based on search queries and category
const filteredRunewords = computed(() => {
  let filtered = [...visibleRunewords.value];

  // Apply category filter
  if (selectedCategory.value !== 'all') {
    filtered = filtered.filter(runeword => {
      switch (selectedCategory.value) {
        case 'new':
          return runeword.IsNew;
        case 'weapons':
          return runeword.IsWeapon;
        case 'armors':
          return runeword.IsTorso;
        case 'helmets':
          return runeword.IsHelmet;
        case 'shields':
          return runeword.IsShield;
        default:
          return true;
      }
    });
  }

  // Apply name search filter if query exists
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(runeword => 
      runeword.Name.toLowerCase().includes(query)
    );
  }

  // Apply runes search filter if query exists
  if (runesSearchQuery.value.trim()) {
    const runesQuery = runesSearchQuery.value.toLowerCase();
    // Split by spaces or commas
    const searchRunes = runesQuery.split(/[\s,]+/).filter(rune => rune.trim() !== '');

    if (searchRunes.length > 0) {
      filtered = filtered.filter(runeword => {
        const runewordRunes = runeword.RuneNames.map(rune => rune.toLowerCase());
        // Check if all search runes match exactly with the runeword runes
        return searchRunes.every(searchRune => 
          runewordRunes.some(runewordRune => runewordRune === searchRune)
        );
      });
    }
  }

  return filtered;
});

// Get human-readable allowed items
const getAllowedItemsText = (allowedItems) => {
  if (!allowedItems || allowedItems.length === 0) return 'None';

  return allowedItems.map(itemCode => {
    // Find the mapping for the item code
    // First try exact match
    if (itemMapping[itemCode]) {
      return itemMapping[itemCode].name;
    }

    // If no exact match, try to find a partial match
    // This handles cases like "shld" matching to "shie" in the mapping
    for (const [code, details] of Object.entries(itemMapping)) {
      if (itemCode.includes(code) || code.includes(itemCode)) {
        return details.name;
      }
    }

    // If no mapping found, return the original code
    return itemCode;
  }).join(', ');
};

/**
 * What this entry can be made in.
 *
 * A runeword allowed in two item types is exported once per type, and both
 * carried the full AllowedItems list - so Deliverance read "Armor, Shield"
 * twice and nothing said that Paladin shields are excluded. Types[0] is the
 * one this entry is actually for; ETypes are the exclusions.
 */
const getEntryItemsText = (runeword) => {
  const own = fieldOf(runeword, 'Types')?.[0];
  const base = own
    ? getAllowedItemsText([own])
    : getAllowedItemsText(fieldOf(runeword, 'AllowedItems'));

  const excluded = fieldOf(runeword, 'ETypes') ?? [];
  return excluded.length ? `${base} (not ${getAllowedItemsText(excluded)})` : base;
};

// Changes of a reworked runeword vs vanilla, as display lines.
// Properties are paired by prop code + parameter.
const getReworkChanges = (runeword) => {
  const changes = [];

  if (runeword.VanillaProperties) {
    const key = p => `${p.Prop}|${p.Par}`;
    const oldMap = new Map(runeword.VanillaProperties.map(p => [key(p), p]));
    const newMap = new Map(runeword.Properties.map(p => [key(p), p]));

    for (const [k, np] of newMap) {
      const op = oldMap.get(k);
      if (!op) {
        changes.push({ old: null, new: np.Description });
      } else if (op.Description !== np.Description) {
        changes.push({ old: op.Description, new: np.Description });
      }
    }
    for (const [k, op] of oldMap) {
      if (!newMap.has(k)) {
        changes.push({ old: op.Description, new: null });
      }
    }
  }

  if (runeword.VanillaAllowedItems) {
    changes.push({
      label: 'Usable in',
      old: getAllowedItemsText(runeword.VanillaAllowedItems),
      new: getAllowedItemsText(fieldOf(runeword, 'AllowedItems'))
    });
  }

  if (runeword.VanillaRuneNames) {
    changes.push({
      label: 'Runes',
      old: runeword.VanillaRuneNames.join(' - '),
      new: fieldOf(runeword, 'RuneNames').join(' - ')
    });
  }

  return changes;
};

// Scroll to items section
const scrollToItems = async () => {
  // Wait for the DOM to update
  await nextTick();
  if (itemsSection.value) {
    itemsSection.value.scrollIntoView({ behavior: 'smooth' });
  }
};

// Handle search with debounce
const handleSearch = (event, isRunesSearch = false) => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    if (isRunesSearch) {
      runesSearchQuery.value = event.target.value;
    } else {
      searchQuery.value = event.target.value;
    }
  }, 300); // 300ms debounce
};

// Handle Enter key press in search field
const handleSearchKeyup = (event) => {
  if (event.key === 'Enter' && (searchQuery.value.trim() || runesSearchQuery.value.trim())) {
    scrollToItems();
  }
};

// Set category filter
const setCategoryFilter = (category) => {
  selectedCategory.value = category;
  scrollToItems();
};

// Reset filters
const resetFilters = () => {
  searchQuery.value = '';
  runesSearchQuery.value = '';
  selectedCategory.value = 'all';
  onlyReworked.value = false;
};

// Sort properties by priority
const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

/**
 * One group per runeword, its per-item-kind entries underneath.
 *
 * The export writes a runeword once per kind of item it goes in, because the
 * runes give different bonuses in a shield than in body armour and the
 * exclusions differ. Two rows with the same name said none of that; the group
 * says it once and keeps the difference where it belongs.
 */
const toGroups = (list) => {
  const groups = new Map();

  list.forEach((runeword) => {
    const key = runeword.RowId || runeword.Name;
    if (!groups.has(key)) {
      const runes = fieldOf(runeword, 'RuneNames') ?? [];
      groups.set(key, {
        key,
        name: runeword.Name,
        runes,
        sockets: runeword.Sockets ?? runes.length,
        levelReq: runeword.LevelReq ?? 0,
        isNew: runeword.IsNew,
        isReworked: runeword.IsReworked && dataMode.value === 'mod',
        variants: [],
      });
    }

    const changes = runeword.IsReworked ? getReworkChanges(runeword) : [];
    groups.get(key).variants.push({
      label: getEntryItemsText(runeword),
      properties: sortPropertiesByPriority(fieldOf(runeword, 'Properties') ?? []),
      reworkChanges: changes.length ? changes : null,
    });
  });

  return [...groups.values()];
};

const isFiltering = computed(() =>
  Boolean(searchQuery.value || runesSearchQuery.value || selectedCategory.value !== 'all'));

const resultTitle = computed(() => {
  if (searchQuery.value && runesSearchQuery.value) {
    return `Search Results for "${searchQuery.value}" with runes "${runesSearchQuery.value}"`;
  }
  if (searchQuery.value) return `Search Results for "${searchQuery.value}"`;
  if (runesSearchQuery.value) return `Search Results for runes "${runesSearchQuery.value}"`;

  return {
    new: 'New Runewords',
    weapons: 'Weapon Runewords',
    armors: 'Armor Runewords',
    helmets: 'Helmet Runewords',
    shields: 'Shield Runewords',
  }[selectedCategory.value] ?? 'Filtered Runewords';
});

const reworkTitle = computed(() =>
  dataMode.value === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla');

onMounted(() => {
  runewords.value = runewordsData;
});
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">◆</span> 
          Runewords 
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced filters-panel">
          <div class="card-body">
            <!-- Name Search Field -->
            <div class="mb-3">
              <label for="nameSearch" class="form-label text-warning">Search by Name</label>
              <div class="input-group search-input-group">
                <input 
                  id="nameSearch"
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search runewords by name..." 
                  @input="(e) => handleSearch(e, false)"
                  @keyup="handleSearchKeyup"
                  :value="searchQuery"
                >
              </div>
            </div>

            <!-- Runes Search Field -->
            <div class="mb-3">
              <label for="runesSearch" class="form-label text-warning">Search by Runes</label>
              <div class="input-group search-input-group">
                <input 
                  id="runesSearch"
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search by runes (e.g., Jah Ber)..." 
                  @input="(e) => handleSearch(e, true)"
                  @keyup="handleSearchKeyup"
                  :value="runesSearchQuery"
                >
                <button 
                  class="btn btn-outline-secondary" 
                  type="button" 
                  @click="resetFilters"
                  v-if="searchQuery || runesSearchQuery"
                >
                  Clear
                </button>
              </div>
              <small class="form-text text-muted">Enter exact rune names, separated by spaces or commas</small>
            </div>

            <!-- Category Filter Buttons -->
            <div class="mb-3">
              <label class="form-label text-warning">Filter by Category</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'all' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('all')"
                >
                  All
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'new' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('new')"
                >
                  New
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'weapons' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('weapons')"
                >
                  Weapons
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'armors' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('armors')"
                >
                  Armors
                </button>
                <button 
                  type="button" 
                  class="btn flex-fill"
                  :class="selectedCategory === 'helmets' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('helmets')"
                >
                  Helmets
                </button>
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="selectedCategory === 'shields' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="setCategoryFilter('shields')"
                >
                  Shields
                </button>
              </div>
            </div>

            <!-- Data source toggle -->
            <div class="mb-1">
              <label class="form-label text-warning">Data</label>
              <div class="btn-group d-flex flex-wrap gap-2" role="group">
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="dataMode === 'mod' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="dataMode = 'mod'"
                >
                  Relics of Sanctuary
                </button>
                <button
                  type="button"
                  class="btn flex-fill"
                  :class="dataMode === 'vanilla' ? 'btn-secondary' : 'btn-outline-secondary'"
                  @click="dataMode = 'vanilla'"
                >
                  Vanilla
                </button>
              </div>
              <div class="form-check mt-2 reworked-toggle">
                <input id="rw-only-reworked" v-model="onlyReworked" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-only-reworked">
                  {{ dataMode === 'vanilla' ? 'Only changed by mod' : 'Only reworked' }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Runewords Tables -->
    <div class="row g-4" ref="itemsSection">
      <div class="col-12" v-if="isFiltering">
        <RunewordTable :title="resultTitle" :groups="toGroups(filteredRunewords)" :rework-title="reworkTitle" />
      </div>

      <template v-else>
        <div class="col-12" v-if="categorizedRunewords.new.length > 0">
          <RunewordTable title="New Runewords" :groups="toGroups(categorizedRunewords.new)" :rework-title="reworkTitle" />
        </div>
        <div class="col-12" v-if="categorizedRunewords.weapons.length > 0">
          <RunewordTable title="Weapon Runewords" :groups="toGroups(categorizedRunewords.weapons)" :rework-title="reworkTitle" />
        </div>
        <div class="col-12" v-if="categorizedRunewords.armors.length > 0">
          <RunewordTable title="Armor Runewords" :groups="toGroups(categorizedRunewords.armors)" :rework-title="reworkTitle" />
        </div>
        <div class="col-12" v-if="categorizedRunewords.helmets.length > 0">
          <RunewordTable title="Helmet Runewords" :groups="toGroups(categorizedRunewords.helmets)" :rework-title="reworkTitle" />
        </div>
        <div class="col-12" v-if="categorizedRunewords.shields.length > 0">
          <RunewordTable title="Shield Runewords" :groups="toGroups(categorizedRunewords.shields)" :rework-title="reworkTitle" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* The rolls a property group draws from, indented under the line that
   introduces them - the same treatment the item pages give them. */
.property-rolls {
  list-style: none;
  margin: 4px 0 0;
  padding: 0 0 0 14px;
  border-left: 2px solid rgba(255, 255, 255, 0.14);
}

.property-rolls li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.9em;
  opacity: 0.85;
  padding: 1px 0;
}

.roll-chance {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.reworked-toggle .form-check-label {
  color: rgba(201, 163, 106, 0.95);
  font-size: 0.9rem;
}

.expand-btn {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  white-space: nowrap;
}

.filters-panel {
  background: linear-gradient(180deg, rgba(32, 24, 18, 0.95), rgba(16, 12, 10, 0.98));
  border: 1px solid rgba(59, 42, 31, 0.9);
}

.filters-panel .card-body {
  padding: 1.5rem;
}

.expanded-row {
  background-color: rgba(14, 10, 8, 0.8) !important;
}

.expanded-row td {
  padding: 0;
}

.table-dark tbody tr {
  transition: background-color 0.2s ease;
}

@media (max-width: 767.98px) {
  .filters-panel .card-body {
    padding: 1.1rem;
  }

  .table-responsive {
    margin: -0.75rem;
    width: calc(100% + 1.5rem);
  }
}


</style>

