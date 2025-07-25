// Simple test to verify new runewords filtering logic
import runewordsData from './src/assets/runewords.json' assert { type: 'json' };

// Simulate the filtering logic from the Vue component
function filterRunewordsByCategory(runewords, category) {
  if (category === 'all') {
    return runewords;
  }
  
  return runewords.filter(runeword => {
    switch (category) {
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

// Test the filtering
console.log('Total runewords:', runewordsData.length);

const newRunewords = filterRunewordsByCategory(runewordsData, 'new');
console.log('New runewords:', newRunewords.length);
console.log('First 5 new runewords:', newRunewords.slice(0, 5).map(r => r.Name));

const weaponRunewords = filterRunewordsByCategory(runewordsData, 'weapons');
console.log('Weapon runewords:', weaponRunewords.length);

const armorRunewords = filterRunewordsByCategory(runewordsData, 'armors');
console.log('Armor runewords:', armorRunewords.length);

const helmetRunewords = filterRunewordsByCategory(runewordsData, 'helmets');
console.log('Helmet runewords:', helmetRunewords.length);

const shieldRunewords = filterRunewordsByCategory(runewordsData, 'shields');
console.log('Shield runewords:', shieldRunewords.length);

// Verify that we have new runewords in the data
const allNewRunewords = runewordsData.filter(r => r.IsNew);
console.log('All new runewords found in data:', allNewRunewords.length);
console.log('New runewords names:', allNewRunewords.map(r => r.Name));