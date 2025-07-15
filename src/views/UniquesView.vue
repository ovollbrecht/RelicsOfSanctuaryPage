<script setup>
import { ref, onMounted, computed } from 'vue';
import uniqueItemsData from '@/assets/unique_items.json';

const uniqueItems = ref([]);
const itemPairs = computed(() => {
  // Group normal and exalted items together
  const pairs = [];
  const exaltedItems = {};

  // First, identify all exalted items
  uniqueItems.value.forEach(item => {
    if (item.Name.startsWith('Exalted ')) {
      const baseName = item.Name.substring(8); // Remove "Exalted " prefix
      exaltedItems[baseName] = item;
    }
  });

  // Then create pairs of normal and exalted items
  uniqueItems.value.forEach(item => {
    if (!item.Name.startsWith('Exalted ')) {
      const exaltedItem = exaltedItems[item.Name];
      if (exaltedItem) {
        pairs.push({
          normal: item,
          exalted: exaltedItem
        });
      }
    }
  });

  return pairs;
});

// Function to get non-zero stats
const getNonZeroStats = (stats) => {
  return Object.entries(stats).filter(([_, value]) => value !== '0' && value !== '0 to 0');
};

// Function to sort properties by priority (descending)
const sortPropertiesByPriority = (properties) => {
  return [...properties].sort((a, b) => parseInt(b.Priority) - parseInt(a.Priority));
};

// Function to get image URL
const getImageUrl = (imagePath) => {
  try {
    return new URL(`../assets/item_images/${imagePath}`, import.meta.url).href;
  } catch (error) {
    console.error(`Error loading image: ${imagePath}`, error);
    return '';
  }
};

onMounted(() => {
  // Load unique items data
  uniqueItems.value = uniqueItemsData;
});
</script>

<template>
  <div class="uniques">
    <h1>Unique Items</h1>
    <p>Browse our collection of unique items with detailed stats and properties.</p>

    <div class="items-container">
      <div v-for="(pair, index) in itemPairs" :key="index" class="item-card">
        <h2 class="item-name">{{ pair.normal.Name }}</h2>
        <h3 class="base-item">{{ pair.normal.BaseItemName }}</h3>

        <!-- Single image for both items -->
        <div class="item-image-container">
          <img 
            :src="getImageUrl(pair.normal.ImageMapping)"
            :alt="pair.normal.Name" 
            class="item-image"
          />
        </div>

        <div class="item-pair">
          <!-- Normal Item -->
          <div class="item-details">
            <h4>Normal</h4>
            <p class="percent-text">{{ pair.normal.Percent }}</p>
            <div class="item-stats">
              <h5>Stats</h5>
              <ul>
                <li v-for="(stat, index) in getNonZeroStats(pair.normal.Stats)" :key="index">
                  {{ stat[0] }}: {{ stat[1] }}
                </li>
              </ul>
            </div>

            <div class="item-properties">
              <h5>Properties</h5>
              <ul>
                <li v-for="(prop, propIndex) in sortPropertiesByPriority(pair.normal.Properties)" :key="propIndex">
                  {{ prop.Description }}
                </li>
              </ul>
            </div>
          </div>

          <!-- Exalted Item -->
          <div class="item-details">
            <h4>Exalted</h4>
            <p class="percent-text">{{ pair.exalted.Percent }}</p>
            <div class="item-stats">
              <h5>Stats</h5>
              <ul>
                <li v-for="(stat, index) in getNonZeroStats(pair.exalted.Stats)" :key="index">
                  {{ stat[0] }}: {{ stat[1] }}
                </li>
              </ul>
            </div>

            <div class="item-properties">
              <h5>Properties</h5>
              <ul>
                <li v-for="(prop, propIndex) in sortPropertiesByPriority(pair.exalted.Properties)" :key="propIndex">
                  {{ prop.Description }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uniques {
  padding: 1rem;
}

h1 {
  margin-bottom: 1rem;
}

.items-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(600px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.item-card {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.item-name {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.base-item {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: #666;
  font-weight: normal;
}

.item-pair {
  display: flex;
  gap: 2rem;
}

.item-details {
  flex: 1;
}

.item-image-container {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
  background-color: #2c3e50;
  padding: 1rem;
  border-radius: 4px;
}

.item-image {
  max-width: 100%;
  max-height: 150px;
  object-fit: contain;
}

h4 {
  margin-bottom: 0.25rem;
  text-align: center;
  font-size: 1.2rem;
}

.percent-text {
  font-size: 0.8rem;
  color: #888;
  text-align: center;
  margin-top: 0;
  margin-bottom: 0.75rem;
}

h5 {
  margin-bottom: 0.5rem;
  font-size: 1rem;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.5rem;
}

ul {
  margin-top: 0.5rem;
  padding-left: 1.5rem;
}

li {
  margin-bottom: 0.5rem;
}

.item-stats, .item-properties {
  margin-bottom: 1.5rem;
}

@media (max-width: 768px) {
  .item-pair {
    flex-direction: column;
  }

  .items-container {
    grid-template-columns: 1fr;
  }
}
</style>
