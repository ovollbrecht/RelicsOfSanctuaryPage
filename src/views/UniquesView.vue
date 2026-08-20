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

// Rainbow Facet metadata: 8 base jewels = 4 elements x 2 triggers
// (death-skill / levelup-skill); their Exalted counterparts swap the trigger
// to hit-skill / gethit-skill.
const FACET_ELEMENTS = {
  ltng: 'Lightning',
  cold: 'Cold',
  fire: 'Fire',
  pois: 'Poison',
  mag: 'Magic',
  phys: 'Physical',
};

const FACET_TRIGGER_LABELS = {
  death: 'Death',
  level: 'Level',
  hit: 'On Hit',
  gethit: 'Get Hit',
};

// Three families carry an element: the Rainbow Facets, the unique jewels, and
// the Sunder Charms. Restricted to those on purpose - plenty of ordinary
// uniques add fire damage without being "a fire item".
const ELEMENT_BY_SUFFIX = {
  ltng: 'ltng', light: 'ltng',
  cold: 'cold',
  fire: 'fire',
  pois: 'pois', poison: 'pois',
  mag: 'mag', magic: 'mag',
  dmg: 'phys', damage: 'phys',
};

const isFacet = (item) => /Rainbow Facet$/.test(item?.Name ?? '');
const isUniqueJewel = (item) => (item?.Types ?? []).includes('cjwl');
const isSunderCharm = (item) =>
  (item?.Properties ?? []).some(p => (p.Prop ?? '').startsWith('pierce-immunity-'));

const elementOf = (item) => {
  if (!item || !(isFacet(item) || isUniqueJewel(item) || isSunderCharm(item))) return null;
  for (const p of item.Properties ?? []) {
    const match = /^(?:pierce|extra|dmg)-(?:immunity-)?(ltng|light|cold|fire|pois|poison|mag|magic|dmg|damage)$/
      .exec(p.Prop ?? '');
    if (match) return ELEMENT_BY_SUFFIX[match[1]];
  }
  return null;
};

// The jewels ship an image path the game never extracted, and the charms none
// at all. Both are recognisable enough by their element colour, so they borrow
// a shape: the facets' gem, and the grand charm every other charm uses.
const FACET_IMAGE = 'gem_perfect_diamond.webp';
const GRAND_CHARM_IMAGE = 'charm_charm_large.webp';

const imageFor = (item) =>
  isUniqueJewel(item) ? FACET_IMAGE
    : isSunderCharm(item) ? GRAND_CHARM_IMAGE
    : item?.ImageMapping;

const facetInfo = (item) => {
  if (!item || (item.Name !== 'Rainbow Facet' && item.Name !== 'Exalted Rainbow Facet')) return null;
  const props = item.Properties || [];
  const elemProp = props.find(p => /^(pierce|extra)-(ltng|cold|fire|pois)$/.test(p.Prop));
  const element = elemProp ? elemProp.Prop.split('-')[1] : null;
  const trigger =
    props.some(p => p.Prop === 'death-skill') ? 'death' :
    props.some(p => p.Prop === 'levelup-skill') ? 'level' :
    props.some(p => p.Prop === 'hit-skill') ? 'hit' :
    props.some(p => p.Prop === 'gethit-skill') ? 'gethit' : null;
  return element && trigger ? { element, trigger } : null;
};

// Exalted facets change the trigger: death -> on hit, level -> get hit.
const exaltedTriggerOf = (baseTrigger) =>
  baseTrigger === 'death' ? 'hit' : baseTrigger === 'level' ? 'gethit' : baseTrigger;

// A Sunder Charm comes in two states: the Latent one that drops, and the
// Renewed one the cube makes from it. They belong in one window the way a
// normal and an exalted item do. The plain vanilla charms the mod replaced -
// the ones a Latent version exists for - are not shown at all.
const CHARM_PREFIX = 'Latent ';
const RENEWED_PREFIX = 'Renewed ';

const itemPairs = computed(() => {
  const pairs = [];
  const exaltedQueues = new Map();

  const supersededNames = new Set(
    uniqueItems.value
      .filter(item => item.Name.startsWith(CHARM_PREFIX))
      .map(item => item.Name.slice(CHARM_PREFIX.length)),
  );

  const renewedByName = new Map(
    uniqueItems.value
      .filter(item => item.Name.startsWith(RENEWED_PREFIX))
      .map(item => [item.Name.slice(RENEWED_PREFIX.length), item]),
  );

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
    if (item.Name.startsWith('Exalted ') || item.Name.startsWith(RENEWED_PREFIX)) return;

    // Superseded by a Latent version, so it is a row the mod no longer uses.
    if (supersededNames.has(item.Name)) return;

    if (item.Name.startsWith(CHARM_PREFIX)) {
      const bare = item.Name.slice(CHARM_PREFIX.length);
      pairs.push({
        normal: item,
        exalted: renewedByName.get(bare) ?? null,
        facet: null,
        element: elementOf(item),
        title: bare,
        normalLabel: 'Latent',
        exaltedLabel: 'Renewed',
      });
      return;
    }

    {
      const queue = exaltedQueues.get(item.Name);
      if (queue && queue.length) {
        // Same-name multi-entries (the 8 Rainbow Facets) are paired by
        // element + expected trigger instead of queue order.
        const info = facetInfo(item);
        let exalted;
        if (info && queue.length > 1) {
          const expected = exaltedTriggerOf(info.trigger);
          const idx = queue.findIndex(e => {
            const ei = facetInfo(e);
            return ei && ei.element === info.element && ei.trigger === expected;
          });
          exalted = idx >= 0 ? queue.splice(idx, 1)[0] : queue.shift();
        } else {
          exalted = queue.shift();
        }
        pairs.push({ normal: item, exalted, facet: info, element: elementOf(item) });
      } else {
        // No exalted counterpart. These used to fall out of the page entirely,
        // which is why the crafted sunder charms and the unique jewels were
        // nowhere to be found - they are obtained rather than dropped, and the
        // mod never made an exalted version of them.
        pairs.push({ normal: item, exalted: null, facet: facetInfo(item), element: elementOf(item) });
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
    // Types runs from the most specific to the most general - a crafted sunder
    // charm is csch, then char, then misc - so walk it rather than insisting on
    // the first. An unmapped leading type used to drop the item from the page
    // without a word, which is how the crafted charms and the unique jewels
    // stayed invisible even once the data carried them.
    const itemType = (item.Types || []).find(t => itemMapping[t]);
    const mapping = itemType ? itemMapping[itemType] : null;

    if (!mapping) return;

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
      if (!result[tier]) {
        // Unknown/empty tier on a weapon/armor item would otherwise crash the
        // whole view - keep the page alive and make the data problem visible.
        console.warn(`Unique item '${item.Name}' has unknown tier '${tier}' - skipped.`);
        return;
      }
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

// A group's odds, at the precision the numbers actually carry: 60% stays 60%,
// and Gheed-style 9.9% keeps its digit instead of rounding to a lie.
const formatChance = (chance) => {
  const percent = chance * 100;
  return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, '') : Math.round(percent)}%`;
};

const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

// The two panels a card shows side by side, with their lists worked out once
// instead of twice per render. A panel with nothing in a section leaves the
// heading off: a charm has no defense, durability or damage, and six of its
// eight lines were an empty "Stats" box.
const variantsOf = (pair) => {
  const panel = (item, label) => ({
    item,
    label,
    stats: getNonZeroStats(item.Stats ?? {}),
    properties: sortPropertiesByPriority(item.Properties ?? []),
  });

  const panels = [panel(pair.normal, pair.normalLabel ?? 'Normal')];
  if (pair.exalted) panels.push(panel(pair.exalted, pair.exaltedLabel ?? 'Exalted'));
  return panels;
};

const getImageUrl = (imagePath) => {
  return new URL(`../assets/item_images/${imagePath}`, import.meta.url).href;
};

// Hide the <img> when the mapped file does not exist (new item whose sprite
// has not been extracted yet) instead of showing a broken-image icon.
const hideBrokenImage = (event) => {
  event.target.style.display = 'none';
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
        <div class="card card-enhanced card-hover h-100" :class="pair.element ? 'facet-card facet-' + pair.element : ''">
          <div class="card-header card-header-primary">
            <h2 class="h4 mb-1">
              {{ pair.title ?? pair.normal.Name }}<template v-if="pair.element"> — {{ FACET_ELEMENTS[pair.element] }}</template>
            </h2>
            <h3 class="h6 mb-0 fw-normal">
              {{ pair.normal.BaseItemName }}
              <template v-if="pair.facet">
                <span class="badge facet-chip ms-2">{{ FACET_TRIGGER_LABELS[pair.facet.trigger] }}</span>
                <span class="facet-chip-arrow">→</span>
                <span class="badge facet-chip">Exalted: {{ FACET_TRIGGER_LABELS[exaltedTriggerOf(pair.facet.trigger)] }}</span>
              </template>
            </h3>
          </div>

          <div class="card-body">
            <div class="item-image-container">
              <img
                  :src="getImageUrl(imageFor(pair.normal))"
                  :alt="pair.normal.Name"
                  class="img-fluid"
                  :class="pair.element ? 'element-tinted' : ''"
                  loading="lazy"
                  @error="hideBrokenImage"
              />
            </div>

            <div class="row item-comparison-row">
              <div
                  v-for="(variant, variantIndex) in variantsOf(pair)"
                  :key="variant.label"
                  :class="pair.exalted ? (variantIndex === 0 ? 'col-md-6 mb-3 mb-md-0' : 'col-md-6') : 'col-12'"
              >
                <div class="card h-100 item-variant-card">
                  <div class="card-header card-header-dark text-center">
                    <h4 class="h5 mb-0">{{ variant.label }}</h4>
                    <!-- What you do to get one: the odds, or the cube recipe
                         for the items you assemble rather than find. -->
                    <small v-if="variant.item.Recipe" class="text-light opacity-75 recipe-line">
                      {{ variant.item.Recipe.join(' + ') }}
                    </small>
                    <small v-else-if="variant.item.Drops !== false" class="text-light opacity-75">
                      {{ variant.item.Percent }}
                    </small>
                    <small v-else class="text-light opacity-75">does not drop</small>
                  </div>
                  <div class="card-body">
                    <template v-if="variant.stats.length">
                      <h5 class="section-header">Stats</h5>
                      <ul class="list-group list-group-flush mb-3">
                        <li
                            v-for="(stat, index) in variant.stats"
                            :key="index"
                            class="list-group-item list-item-enhanced"
                        >
                          {{ stat[0] }}: {{ stat[1] }}
                        </li>
                      </ul>
                    </template>

                    <template v-if="variant.properties.length">
                      <h5 class="section-header">Properties</h5>
                      <ul class="list-group list-group-flush">
                        <li
                            v-for="(prop, propIndex) in variant.properties"
                            :key="propIndex"
                            class="list-group-item list-item-property"
                        >
                          {{ prop.Description }}
                          <ul v-if="prop.Rolls" class="property-rolls">
                            <li v-for="(roll, rollIndex) in prop.Rolls" :key="rollIndex">
                              <span>{{ roll.Description }}</span>
                              <span v-if="roll.Chance != null" class="roll-chance">{{ formatChance(roll.Chance) }}</span>
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </template>
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
/* A property group's possible rolls, indented under the line that introduces
   them. A crafted sunder charm carries five of these; as one sentence per
   group it was a wall, as a list it is a table you can scan. */
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

/* Four to six ingredients, so it wraps rather than widening the header. */
.recipe-line {
  display: block;
  font-size: 0.78rem;
  line-height: 1.3;
  margin-top: 2px;
}

.roll-chance {
  flex: none;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

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

/* Rainbow Facet cards: subtle element accent, muted to keep the D2 theme */
.facet-card {
  border-left: 3px solid var(--facet-color, rgba(201, 163, 106, 0.6));
  box-shadow: var(--d2r-shadow), inset 6px 0 18px -12px var(--facet-color, transparent);
}

.facet-card .card-header-primary {
  background: linear-gradient(90deg, #3a1e00, #121212 70%),
    linear-gradient(90deg, var(--facet-color, transparent), transparent);
  background-blend-mode: normal;
}

.facet-ltng { --facet-color: rgba(240, 217, 92, 0.65); }
.facet-cold { --facet-color: rgba(94, 158, 217, 0.65); }
.facet-fire { --facet-color: rgba(214, 92, 66, 0.65); }
.facet-pois { --facet-color: rgba(114, 191, 106, 0.65); }
.facet-mag  { --facet-color: rgba(178, 132, 214, 0.65); }
.facet-phys { --facet-color: rgba(178, 168, 152, 0.65); }

/* The sprite in its element's colour. The jewels and the charms borrow a
   shape - a gem and a grand charm - so the colour is what tells six otherwise
   identical pictures apart. */
.element-tinted {
  filter: grayscale(1) sepia(1) hue-rotate(var(--element-rotate, 0deg))
          saturate(var(--element-saturate, 3)) brightness(var(--element-bright, 1));
}

.facet-ltng { --element-rotate: 15deg;  --element-saturate: 3.5; --element-bright: 1.15; }
.facet-cold { --element-rotate: 170deg; --element-saturate: 3.2; }
.facet-fire { --element-rotate: -35deg; --element-saturate: 4; }
.facet-pois { --element-rotate: 75deg;  --element-saturate: 3.2; }
.facet-mag  { --element-rotate: 245deg; --element-saturate: 3.5; }
.facet-phys { --element-rotate: 0deg;   --element-saturate: 0.4; --element-bright: 1.05; }

.facet-chip {
  background: color-mix(in srgb, var(--facet-color, #c9a36a) 18%, transparent);
  color: var(--d2r-text);
  border: 1px solid var(--facet-color, rgba(201, 163, 106, 0.5));
  font-size: 0.7rem;
}

.facet-chip-arrow {
  margin: 0 0.35rem;
  color: rgba(194, 176, 143, 0.6);
  font-size: 0.75rem;
}
</style>
