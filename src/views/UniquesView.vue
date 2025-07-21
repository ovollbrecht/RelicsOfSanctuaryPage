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
  const exaltedItems = {};

  uniqueItems.value.forEach(item => {
    if (item.Name.startsWith('Exalted ')) {
      const baseName = item.Name.substring(8);
      exaltedItems[baseName] = item;
    }
  });

  uniqueItems.value.forEach(item => {
    if (!item.Name.startsWith('Exalted ')) {
      const exaltedItem = exaltedItems[item.Name];
      if (exaltedItem) {
        pairs.push({ normal: item, exalted: exaltedItem });
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
  <div class="container py-4">
    <div class="row">
      <div class="col-12">
        <h1 class="display-4 mb-4 text-warning mobile-title">
          <span class="title-icon">⚔</span> 
          Unique Items 
          <span class="title-icon">⚔</span>
        </h1>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced">
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
                            class="badge bg-secondary text-decoration-none"
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
                            class="badge bg-secondary text-decoration-none"
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
                            class="badge bg-secondary text-decoration-none"
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
                            class="badge bg-secondary text-decoration-none"
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
                            class="badge bg-secondary text-decoration-none"
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
                            class="badge bg-secondary text-decoration-none"
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
                          class="badge bg-secondary text-decoration-none"
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
                  style="max-height: 150px; object-fit: contain;"
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
/* Enhanced Typography */
.display-4 {
  font-family: 'EB Garamond', serif;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  color: var(--d2r-gold);
  border-bottom: 2px solid var(--d2r-gold);
  padding-bottom: 0.5rem;
  text-align: center;
  background: linear-gradient(to bottom, rgba(20, 10, 0, 0.7), transparent);
}

.title-icon {
  font-size: 0.8em;
  vertical-align: middle;
  margin: 0 0.5rem;
  opacity: 0.8;
  text-shadow: 0 0 10px var(--d2r-gold);
  display: inline-block;
}


.text-warning {
  color: var(--d2r-gold);
}

/* Enhanced Badges */
.badge {
  transition: all 0.3s ease;
  margin-bottom: 0.25rem;
  font-family: 'EB Garamond', serif;
  font-weight: 600;
  letter-spacing: 0.03em;
  border-radius: 0.25rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.badge.bg-secondary {
  background: linear-gradient(135deg, #333, #222) !important;
  color: var(--d2r-text);
  border: 1px solid var(--d2r-border);
}

.badge.bg-secondary:hover {
  background: linear-gradient(135deg, #5e3200, #3a2000) !important;
  color: var(--d2r-gold);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

/* Enhanced Section Headers */
.section-header {
  color: var(--d2r-gold);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--d2r-border);
  padding-bottom: 0.5rem;
  letter-spacing: 0.05em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* Enhanced Cards */
.card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-radius: 0.5rem;
  overflow: hidden;
  /* transition removed */
  position: relative;
}

/* Gold gradient line animation removed */

.card-enhanced {
  border: 1px solid var(--d2r-border);
  background: linear-gradient(to bottom, #2a2a2a, #1e1e1e);
}

.card-hover:hover {
  /* Animation removed */
}

.card-header-primary {
  background: linear-gradient(90deg, #3a1e00, #0e0e0e);
  border-bottom: 2px solid var(--d2r-gold);
  position: relative;
}

.card-header-dark {
  background: linear-gradient(135deg, #2e2e2e, #000);
  border-bottom: 1px solid var(--d2r-border);
  position: relative;
}

.card-header-dark h4 {
  position: relative;
  z-index: 1;
}

/* Enhanced List Items */
.list-group-item {
  background-color: rgba(40, 40, 40, 0.8);
  border-color: var(--d2r-border);
  transition: all 0.2s ease;
}

.list-group-item:hover {
  background-color: rgba(58, 58, 58, 0.8);
}

.list-item-enhanced {
  border-left: 4px solid var(--d2r-gold);
}

.list-item-property {
  border-left: 4px solid #2a2a2a;
}

/* Enhanced Image Container */
.item-image-container {
  background: radial-gradient(ellipse at center, #333 0%, #111 100%);
  border: 2px solid var(--d2r-border);
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  text-align: center;
}

.item-image-container img {
  filter: drop-shadow(0 0 8px rgba(198, 156, 109, 0.3));
  transition: all 0.3s ease;
}

.item-image-container:hover img {
  /* Animation removed */
}

/* Spacing */
.gap-2 {
  gap: 0.75rem !important;
}

.py-4 {
  padding-top: 2rem !important;
  padding-bottom: 2rem !important;
}

/* Search Input Styling */
.search-input-group {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border-radius: 0.25rem;
  overflow: hidden;
  position: relative;
}

.search-input-group::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--d2r-gold), transparent);
  z-index: 1;
}

.search-input {
  background-color: rgba(30, 30, 30, 0.9);
  color: var(--d2r-text);
  border: 1px solid var(--d2r-border);
  padding: 0.75rem 1rem;
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  transition: all 0.3s ease;
}

.search-input:focus {
  background-color: rgba(40, 40, 40, 0.9);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 0 0.2rem rgba(198, 156, 109, 0.25);
  letter-spacing: 0.05em;
}

.search-input::placeholder {
  color: rgba(224, 212, 183, 0.5);
  font-style: italic;
}

.btn-outline-secondary {
  border-color: var(--d2r-border);
  color: var(--d2r-gold);
  background: linear-gradient(135deg, #2e2e2e, #1a1a1a);
  font-family: 'EB Garamond', serif;
  letter-spacing: 0.03em;
  transition: all 0.3s ease;
}

.btn-outline-secondary:hover {
  background: linear-gradient(135deg, #5e3200, #3a2000);
  color: var(--d2r-gold);
  border-color: var(--d2r-gold);
  box-shadow: 0 0 8px rgba(198, 156, 109, 0.4);
}

/* Filter Category Styling */
.card-header h3 {
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  letter-spacing: 0.05em;
}

.h6 {
  color: var(--d2r-gold);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
}

/* Mobile Responsive Styles */
@media (max-width: 767.98px) {
  .mobile-title {
    font-size: 1.8rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
  }

  .title-icon {
    font-size: 0.7em;
    margin: 0 0.3rem;
  }

  .card {
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .card-body {
    padding: 0.75rem;
  }

  .card-header-primary {
    padding: 0.75rem;
  }

  .card-header-primary h2 {
    font-size: 1.2rem;
  }

  .card-header-primary h3 {
    font-size: 0.9rem;
  }

  .badge {
    padding: 0.5rem 0.75rem;
    margin-right: 0.25rem;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .d-flex.flex-wrap.gap-2 {
    gap: 0.25rem !important;
  }

  .list-group-item {
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
  }

  .section-header {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
    letter-spacing: 0.03em;
  }

  .item-image-container {
    margin-bottom: 1rem;
    text-align: center;
    padding: 1rem;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
  }

  .item-image-container img {
    max-height: 120px;
    filter: drop-shadow(0 0 5px rgba(198, 156, 109, 0.2));
  }

  .filter-indicator {
    margin-bottom: 0.5rem;
  }

  .filter-indicator h2 {
    font-size: 1.25rem;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  }

  .item-comparison-row {
    margin-left: -0.5rem;
    margin-right: -0.5rem;
  }

  .item-variant-card {
    margin-bottom: 1rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .item-variant-card .card-header {
    padding: 0.5rem;
  }

  .item-variant-card .card-header h4 {
    font-size: 1rem;
  }

  .card-enhanced {
    margin-bottom: 1.5rem;
  }

  /* Improve touch targets for mobile */
  .btn {
    padding: 0.5rem 0.75rem;
    min-height: 44px;
  }

  .btn-outline-secondary {
    letter-spacing: 0.02em;
  }

  /* Ensure proper spacing in the container */
  .container.py-4 {
    padding-left: 1rem;
    padding-right: 1rem;
    padding-top: 1.5rem !important;
    padding-bottom: 1.5rem !important;
  }

  /* Mobile-friendly search input */
  .search-input-group {
    width: 100%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .search-input {
    height: 44px;
    font-size: 1rem;
    letter-spacing: 0.02em;
  }

}
</style>
