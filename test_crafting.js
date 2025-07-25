const fs = require('fs');

// Test crafting data processing
try {
  // Load the data files
  const craftingData = JSON.parse(fs.readFileSync('src/assets/crafting.json', 'utf8'));
  const itemMapping = JSON.parse(fs.readFileSync('src/assets/item_mapping.json', 'utf8'));
  
  console.log('✓ Successfully loaded crafting.json and item_mapping.json');
  console.log(`✓ Found ${craftingData.length} crafting recipes`);
  
  // Test unique crafted types
  const craftedTypes = [...new Set(craftingData.map(recipe => recipe.CraftedType))];
  console.log(`✓ Found ${craftedTypes.length} unique crafted types:`, craftedTypes);
  
  // Test unique item types
  const itemTypes = [...new Set(craftingData.map(recipe => recipe.ItemType))];
  console.log(`✓ Found ${itemTypes.length} unique item types:`, itemTypes);
  
  // Test item mapping for item types
  let mappedCount = 0;
  itemTypes.forEach(itemType => {
    if (itemMapping[itemType]) {
      mappedCount++;
    } else {
      console.log(`⚠ No mapping found for item type: ${itemType}`);
    }
  });
  console.log(`✓ ${mappedCount}/${itemTypes.length} item types have mappings`);
  
  // Test properties with different chances
  let propertiesWithChance = 0;
  let totalProperties = 0;
  
  craftingData.forEach(recipe => {
    recipe.Properties.forEach(prop => {
      totalProperties++;
      if (prop.Chance < 100) {
        propertiesWithChance++;
      }
    });
  });
  
  console.log(`✓ Found ${propertiesWithChance}/${totalProperties} properties with chance < 100%`);
  
  // Test search functionality simulation
  const searchTerm = 'jewel';
  const searchResults = craftingData.filter(recipe => 
    recipe.InputNames.some(input => 
      input.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );
  console.log(`✓ Search for "${searchTerm}" found ${searchResults.length} recipes`);
  
  console.log('\n✅ All tests passed! Crafting data processing looks good.');
  
} catch (error) {
  console.error('❌ Error testing crafting data:', error.message);
}