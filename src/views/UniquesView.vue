<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import uniqueItemsData from '@/assets/unique_items.json';
import itemMapping from '@/assets/item_mapping.json';

const uniqueItems = ref([]);
const searchQuery = ref('');
const activeFilters = ref({
  tier: null,
  category: null,
  type: null
});
const debounceTimeout = ref(null);
const itemsSection = ref(null);

const itemPairs = computed(() => {
  const pairs = [];
  const exaltedQueues = new Map();

  uniqueItems.value.forEach(item => {
    if (item.Name.startsWith('Exalted ')) {
      const baseName = item.Name.substring(8);
      if (!exaltedQueues.has(baseName)) {
        exaltedQueues.set(baseName, []);
      }
      exaltedQueues.get(baseName).push(item);
    }
  });

  uniqueItems.value.forEach(item => {
    if (!item.Name.startsWith('Exalted ')) {
      const queue = exaltedQueues.get(item.Name);
      if (queue && queue.length) {
        pairs.push({ normal: item, exalted: queue.shift() });
      }
    }
  });

  return pairs;
});

// Group items by tier and category
const categorizedItems = computed(() => {
  const result = {
    normal: { weapon: {}, armor: {} },
    exceptional: { weapon: {}, armor: {} },
    elite: { weapon: {}, armor: {} },
    misc: {}
  };

  // Process all item pairs
  itemPairs.value.forEach(pair => {
    const item = pair.normal;
    const itemType = item.Types[0]; // First entry in Types array defines the item type
    const mapping = itemMapping[itemType];

    if (!mapping) return; // Skip if no mapping found

    const category = mapping.type;
    const typeName = mapping.name;

    if (category === 'misc') {
      // Misc items are on the same level as tiers
      if (!result.misc[typeName]) {
        result.misc[typeName] = [];
      }
      result.misc[typeName].push(pair);
    } else {
      // Weapons and armor are grouped by tier
      const tier = item.Tier;
      if (!result[tier][category][typeName]) {
        result[tier][category][typeName] = [];
      }
      result[tier][category][typeName].push(pair);
    }
  });

  return result;
});

// Filter items based on search query and active filters
const filteredItemPairs = computed(() => {
  let filtered = [...itemPairs.value];

  // Apply search filter if query exists
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(pair => 
      pair.normal.Name.toLowerCase().includes(query)
    );
    return filtered;
  }

  // Apply category filters
  if (activeFilters.value.tier && activeFilters.value.tier !== 'misc') {
    filtered = filtered.filter(pair => pair.normal.Tier === activeFilters.value.tier);

    if (activeFilters.value.category) {
      filtered = filtered.filter(pair => {
        const type = pair.normal.Types[0];
        return itemMapping[type]?.type === activeFilters.value.category;
      });

      if (activeFilters.value.type) {
        filtered = filtered.filter(pair => {
          const type = pair.normal.Types[0];
          return itemMapping[type]?.name === activeFilters.value.type;
        });
      }
    }
  } else if (activeFilters.value.tier === 'misc') {
    filtered = filtered.filter(pair => {
      const type = pair.normal.Types[0];
      return itemMapping[type]?.type === 'misc';
    });

    if (activeFilters.value.type) {
      filtered = filtered.filter(pair => {
        const type = pair.normal.Types[0];
        return itemMapping[type]?.name === activeFilters.value.type;
      });
    }
  }

  return filtered;
});

// Scroll to items section
const scrollToItems = async () => {
  // Wait for the DOM to update
  await nextTick();
  if (itemsSection.value) {
    itemsSection.value.scrollIntoView({ behavior: 'smooth' });
  }
};

// Handle search with debounce
const handleSearch = (event) => {
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    searchQuery.value = event.target.value;
  }, 300); // 300ms debounce
};

// Handle Enter key press in search field
const handleSearchKeyup = (event) => {
  if (event.key === 'Enter' && searchQuery.value.trim()) {
    scrollToItems();
  }
};

// Reset filters
const resetFilters = () => {
  activeFilters.value = {
    tier: null,
    category: null,
    type: null
  };
  searchQuery.value = '';
};

// Set active filter
const setFilter = (tier, category = null, type = null) => {
  activeFilters.value = { tier, category, type };
  scrollToItems();
};

const getNonZeroStats = (stats) => {
  return Object.entries(stats).filter(([_, value]) => value !== '0' && value !== '0 to 0');
};

const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

const getImageUrl = (imagePath) => {
  try {
    return new URL(`../assets/item_images/${imagePath}`, import.meta.url).href;
  } catch (error) {
    console.error(`Error loading image: ${imagePath}`, error);
    return '';
  }
};

onMounted(() => {
  uniqueItems.value = uniqueItemsData;
});
</script>

<template>
  <div class="container py-4 page-content">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4">
          <span class="title-icon">⚔</span> 
          Unique Items 
          <span class="title-icon">⚔</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced filters-panel">
          <div class="card-body">
            <!-- Search Field -->
            <div class="mb-4">
              <div class="input-group search-input-group">
                <input 
                  type="text" 
                  class="form-control search-input" 
                  placeholder="Search items..." 
                  @input="handleSearch"
                  @keyup="handleSearchKeyup"
                  :value="searchQuery"
                >
                <button 
                  class="btn btn-outline-secondary" 
                  type="button" 
                  @click="resetFilters"
                  v-if="searchQuery || activeFilters.tier"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- Category Navigation -->
            <div v-if="!searchQuery">
              <div class="row">
                <!-- Tier Categories -->
                <div class="col-md-4 mb-3">
                  <div class="card">
                    <div class="card-header card-header-primary">
                      <h3 class="h5 mb-0">Normal</h3>
                    </div>
                    <div class="card-body">
                      <div class="mb-3">
                        <h4 class="h6 mb-2">Weapons</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.normal.weapon" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('normal', 'weapon', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                      <div>
                        <h4 class="h6 mb-2">Armor</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.normal.armor" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('normal', 'armor', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-md-4 mb-3">
                  <div class="card">
                    <div class="card-header card-header-primary">
                      <h3 class="h5 mb-0">Exceptional</h3>
                    </div>
                    <div class="card-body">
                      <div class="mb-3">
                        <h4 class="h6 mb-2">Weapons</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.exceptional.weapon" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('exceptional', 'weapon', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                      <div>
                        <h4 class="h6 mb-2">Armor</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.exceptional.armor" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('exceptional', 'armor', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-md-4 mb-3">
                  <div class="card">
                    <div class="card-header card-header-primary">
                      <h3 class="h5 mb-0">Elite</h3>
                    </div>
                    <div class="card-body">
                      <div class="mb-3">
                        <h4 class="h6 mb-2">Weapons</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.elite.weapon" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('elite', 'weapon', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                      <div>
                        <h4 class="h6 mb-2">Armor</h4>
                        <div class="d-flex flex-wrap gap-2">
                          <a 
                            v-for="(items, type) in categorizedItems.elite.armor" 
                            :key="type"
                            href="#" 
                            class="badge bg-secondary text-decoration-none filter-badge"
                            @click.prevent="setFilter('elite', 'armor', type)"
                          >
                            {{ type }} ({{ items.length }})
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Misc Items -->
              <div class="row mt-3">
                <div class="col-12">
                  <div class="card">
                    <div class="card-header card-header-primary">
                      <h3 class="h5 mb-0">Miscellaneous</h3>
                    </div>
                    <div class="card-body">
                      <div class="d-flex flex-wrap gap-2">
                        <a 
                          v-for="(items, type) in categorizedItems.misc" 
                          :key="type"
                          href="#" 
                          class="badge bg-secondary text-decoration-none filter-badge"
                          @click.prevent="setFilter('misc', null, type)"
                        >
                          {{ type }} ({{ items.length }})
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Filter Indicator -->
    <div class="row mb-3" v-if="activeFilters.tier || searchQuery">
      <div class="col-12">
        <div class="d-flex align-items-center flex-wrap filter-indicator">
          <h2 class="h4 mb-2 me-2">
            <span v-if="searchQuery">Search results for "{{ searchQuery }}"</span>
            <span v-else-if="activeFilters.type">{{ activeFilters.type }}</span>
            <span v-else-if="activeFilters.category">{{ activeFilters.category === 'weapon' ? 'Weapons' : 'Armor' }}</span>
            <span v-else-if="activeFilters.tier === 'misc'">Miscellaneous</span>
            <span v-else>{{ activeFilters.tier.charAt(0).toUpperCase() + activeFilters.tier.slice(1) }}</span>
          </h2>
          <button class="btn btn-sm btn-outline-secondary mb-2" @click="resetFilters">
            Back to All
          </button>
        </div>
      </div>
    </div>

    <!-- Item Cards -->
    <div class="row g-4 mt-3" ref="itemsSection">
      <div v-for="(pair, index) in filteredItemPairs" :key="index" class="col-12 col-xl-6">
        <div class="card card-enhanced card-hover h-100">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-1">{{ pair.normal.Name }}</h2>
            <h3 class="h6 mb-0 fw-normal">{{ pair.normal.BaseItemName }}</h3>
          </div>

          <div class="card-body">
            <div class="item-image-container">
              <img
                  :src="getImageUrl(pair.normal.ImageMapping)"
                  :alt="pair.normal.Name"
                  class="img-fluid"
              />
            </div>

            <div class="row item-comparison-row">
              <!-- Normal Item -->
              <div class="col-md-6 mb-3 mb-md-0">
                <div class="card h-100 item-variant-card">
                  <div class="card-header card-header-dark text-center">
                    <h4 class="h5 mb-0">Normal</h4>
                    <small class="text-light opacity-75">{{ pair.normal.Percent }}</small>
                  </div>
                  <div class="card-body">
                    <h5 class="section-header">Stats</h5>
                    <ul class="list-group list-group-flush mb-3">
                      <li
                          v-for="(stat, index) in getNonZeroStats(pair.normal.Stats)"
                          :key="index"
                          class="list-group-item list-item-enhanced"
                      >
                        {{ stat[0] }}: {{ stat[1] }}
                      </li>
                    </ul>

                    <h5 class="section-header">Properties</h5>
                    <ul class="list-group list-group-flush">
                      <li
                          v-for="(prop, propIndex) in sortPropertiesByPriority(pair.normal.Properties)"
                          :key="propIndex"
                          class="list-group-item list-item-property"
                      >
                        {{ prop.Description }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Exalted Item -->
              <div class="col-md-6">
                <div class="card h-100 item-variant-card">
                  <div class="card-header card-header-dark text-center">
                    <h4 class="h5 mb-0">Exalted</h4>
                    <small class="text-light opacity-75">{{ pair.exalted.Percent }}</small>
                  </div>
                  <div class="card-body">
                    <h5 class="section-header">Stats</h5>
                    <ul class="list-group list-group-flush mb-3">
                      <li
                          v-for="(stat, index) in getNonZeroStats(pair.exalted.Stats)"
                          :key="index"
                          class="list-group-item list-item-enhanced"
                      >
                        {{ stat[0] }}: {{ stat[1] }}
                      </li>
                    </ul>

                    <h5 class="section-header">Properties</h5>
                    <ul class="list-group list-group-flush">
                      <li
                          v-for="(prop, propIndex) in sortPropertiesByPriority(pair.exalted.Properties)"
                          :key="propIndex"
                          class="list-group-item list-item-property"
                      >
                        {{ prop.Description }}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div> <!-- row -->
          </div> <!-- card-body -->
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filters-panel {
  background: linear-gradient(180deg, rgba(32, 24, 18, 0.95), rgba(16, 12, 10, 0.98));
  border: 1px solid rgba(59, 42, 31, 0.9);
}

.filters-panel .card {
  background: rgba(18, 14, 10, 0.85);
  border: 1px solid rgba(59, 42, 31, 0.7);
  box-shadow: none;
}

.filters-panel .card-header {
  background: linear-gradient(90deg, rgba(58, 30, 0, 0.7), rgba(12, 12, 12, 0.6));
  border-bottom: 1px solid rgba(201, 163, 106, 0.45);
}

.filter-badge {
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  border: 1px solid rgba(59, 42, 31, 0.8);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.filter-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
}

.filter-indicator {
  background: rgba(201, 163, 106, 0.08);
  border: 1px solid rgba(201, 163, 106, 0.2);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.35);
}

.filter-indicator h2 {
  font-family: var(--font-display);
  color: var(--d2r-gold);
  letter-spacing: 0.05em;
}

.item-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.item-image-container img {
  max-height: 160px;
  width: auto;
  object-fit: contain;
}

.item-comparison-row {
  row-gap: 1rem;
}

.item-variant-card {
  background: rgba(14, 10, 8, 0.92);
  border: 1px solid rgba(59, 42, 31, 0.6);
  box-shadow: none;
}

.item-variant-card .card-header {
  background: linear-gradient(135deg, rgba(36, 26, 18, 0.9), rgba(12, 8, 6, 0.9));
  border-bottom: 1px solid rgba(201, 163, 106, 0.3);
}

.item-variant-card .card-body {
  padding: 1rem;
}

.item-variant-card .section-header {
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}

.item-variant-card .list-group-item {
  padding: 0.4rem 0.2rem;
}

@media (max-width: 767.98px) {
  .filter-indicator {
    padding: 0.65rem 0.75rem;
  }

  .item-image-container {
    min-height: 150px;
  }

  .item-image-container img {
    max-height: 140px;
  }

  .item-variant-card .card-body {
    padding: 0.85rem;
  }
}
</style>
