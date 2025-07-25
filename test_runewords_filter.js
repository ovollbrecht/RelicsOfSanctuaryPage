// Simple test to verify runewords filtering logic
import runewordsData from './src/assets/runewords.json' assert { type: 'json' };

// Simulate the filtering logic from the Vue component
function filterRunewordsByCategory(runewords, category) {
  if (category === 'all') {
    return runewords;
  }
  
  return runewords.filter(runeword => {
    switch (category) {
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

// Test the filtering
console.log('Total runewords:', runewordsData.length);

const weaponRunewords = filterRunewordsByCategory(runewordsData, 'weapons');
console.log('Weapon runewords:', weaponRunewords.length);
console.log('First 3 weapon runewords:', weaponRunewords.slice(0, 3).map(r => r.Name));

const armorRunewords = filterRunewordsByCategory(runewordsData, 'armors');
console.log('Armor runewords:', armorRunewords.length);
console.log('First 3 armor runewords:', armorRunewords.slice(0, 3).map(r => r.Name));

const helmetRunewords = filterRunewordsByCategory(runewordsData, 'helmets');
console.log('Helmet runewords:', helmetRunewords.length);
console.log('First 3 helmet runewords:', helmetRunewords.slice(0, 3).map(r => r.Name));

const shieldRunewords = filterRunewordsByCategory(runewordsData, 'shields');
console.log('Shield runewords:', shieldRunewords.length);
console.log('First 3 shield runewords:', shieldRunewords.slice(0, 3).map(r => r.Name));

// Verify that categories don't overlap (except for "new" runewords)
const totalCategorized = weaponRunewords.length + armorRunewords.length + helmetRunewords.length + shieldRunewords.length;
console.log('Total categorized runewords:', totalCategorized);
console.log('Should be close to total runewords (some might be uncategorized)');