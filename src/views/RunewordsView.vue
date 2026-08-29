<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';
import itemBaseData from '@/assets/item_bases.json';
import RunewordTable from '@/components/RunewordTable.vue';
import RunewordDetail from '@/components/RunewordDetail.vue';
import SearchableSelect from '@/components/SearchableSelect.vue';

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
// New and reworked are exclusive by construction - a runeword the mod added is
// not a vanilla one it changed - so two checkboxes could only ever be ticked
// together to get nothing back. One choice, "all" first.
const statusFilter = ref('all');

// all | hide | only. Judged per runeword, not per entry: one that fits orbs
// *and* plain swords is not a class runeword, and hiding it would take a
// generally useful option off the page.
const classFilter = ref('all');

// ...and which class, for when the question is "what can my necromancer wear".
const classPick = ref('any');

const SORT_OPTIONS = [
  { value: 'level', label: 'Level' },
  { value: 'name', label: 'Name' },
  { value: 'sockets', label: 'Sockets' },
  { value: 'rune', label: 'Highest rune' },
];
const sortBy = ref('level');
const sortDir = ref('asc');

/* ---- what fits the item in your hand ------------------------------------
   The question this answers is "I found a long staff with three sockets, what
   can I put in it": one filter for the item, one for the socket count.

   The item is pickable at every level of the family tree, because that is how
   the game writes it down - Steel says sword, axe, mace, and a crystal sword
   is a sword is a blade is a melee weapon. So the same runeword has to be
   findable under all four, and the match has to look both ways: the runeword
   for melee weapons belongs under "sword" just as much as the sword runeword
   belongs under "melee weapon". */
const ITEM_FILTER_ANY = 'any';
const itemFilter = ref(ITEM_FILTER_ANY);
const socketFilter = ref('any');

const typeByCode = new Map(itemBaseData.Types.map((type) => [type.Code, type]));
const baseByCode = new Map(itemBaseData.Bases.map((base) => [base.Code, base]));

// A type and everything it belongs to, worked out once per type.
const chainCache = new Map();
const chainOf = (code) => {
  const cached = chainCache.get(code);
  if (cached) return cached;

  const chain = new Set();
  const walk = (current) => {
    if (!current || chain.has(current)) return;
    chain.add(current);
    (typeByCode.get(current)?.Parents ?? []).forEach(walk);
  };
  walk(code);
  chainCache.set(code, chain);
  return chain;
};

const byLabel = (a, b) => a.label.localeCompare(b.label);

const itemFilterOptions = computed(() => [
  { value: ITEM_FILTER_ANY, label: 'Any item' },
  ...itemBaseData.Types
    .map((type) => ({ value: `type:${type.Code}`, label: type.Name, hint: 'kind' }))
    .sort(byLabel),
  ...itemBaseData.Bases
    .map((base) => ({
      value: `base:${base.Code}`,
      label: base.Name,
      hint: `${base.Sockets} sockets max`,
    }))
    .sort(byLabel),
]);

const selectedBase = computed(() => {
  const [kind, code] = itemFilter.value.split(':');
  return kind === 'base' ? baseByCode.get(code) ?? null : null;
});

/* Socket counts worth offering: what runewords actually ask for, and never
   more than the picked base can hold - a katar takes two, so offering five
   would only ever return nothing. */
const socketOptions = computed(() => {
  const counts = [...new Set(runewords.value.map((runeword) => runeword.Sockets))]
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  const ceiling = selectedBase.value?.Sockets ?? Infinity;
  return counts.filter((count) => count <= ceiling);
});

const fitsSelectedItem = (runeword) => {
  if (itemFilter.value === ITEM_FILTER_ANY) return true;

  const [kind, code] = itemFilter.value.split(':');
  const own = runeword.ItemTypes ?? [];
  const excluded = runeword.ETypes ?? [];

  if (kind === 'base') {
    const base = baseByCode.get(code);
    if (!base) return true;
    if (base.Sockets < runeword.Sockets) return false;

    const chain = chainOf(base.Type);
    if (excluded.some((type) => chain.has(type))) return false;
    return own.some((type) => chain.has(type));
  }

  const chain = chainOf(code);
  if (excluded.some((type) => chain.has(type))) return false;
  return own.some((type) => chain.has(type) || chainOf(type).has(code));
};

// Picking a class already says "only class specific"; leaving "hide" on would
// ask for both at once and return nothing.
watch(classPick, (name) => {
  if (name !== 'any' && classFilter.value !== 'all') classFilter.value = 'all';
});

// Picking a base narrows what it can hold; a socket count it cannot reach
// would silently empty the page, so it goes back to "any".
watch(selectedBase, (base) => {
  if (base && socketFilter.value !== 'any' && Number(socketFilter.value) > base.Sockets) {
    socketFilter.value = 'any';
  }
});

// Wide screens keep the open runeword in a sticky panel beside the list, so
// browsing is click - read - click without the table jumping. The breakpoint
// is where the 1200px content shell is fully unfolded next to the sidebar;
// below it, rows expand inline as before.
const wideQuery = window.matchMedia('(min-width: 1500px)');
const isWide = ref(wideQuery.matches);
const syncWide = () => { isWide.value = wideQuery.matches; };

const selectedGroup = ref(null);

/* ---- rune picker --------------------------------------------------------
   Which runes you have, kept for the session so the answer survives a click
   into an item page and back. A ticked rune counts however often a runeword
   asks for it: Deliverance wants two Hels and a checkbox cannot say "two", so
   the picker answers "do you have this rune at all". */
const RUNES_KEY = 'rw-owned-runes';
const RUNE_FILTER_KEY = 'rw-rune-filter';

const readSession = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeSession = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private window or blocked storage is not a reason to break the page.
  }
};

const pickerOpen = ref(false);
const ownedRunes = ref(new Set(readSession(RUNES_KEY, [])));
const useRuneFilter = ref(readSession(RUNE_FILTER_KEY, false) === true);

// Every rune any runeword asks for, in rune order - which is all 33 of them,
// and by construction never one the picker would have no use for.
const allRunes = computed(() => {
  const runes = new Map();
  runewords.value.forEach((runeword) => {
    (runeword.Runes ?? []).forEach((code, index) => {
      if (!runes.has(code)) {
        runes.set(code, {
          code,
          name: (runeword.RuneNames ?? [])[index] ?? code,
          number: Number.parseInt(code.slice(1), 10) || 0,
        });
      }
    });
  });
  return [...runes.values()].sort((a, b) => a.number - b.number);
});

const toggleRune = (code) => {
  const next = new Set(ownedRunes.value);
  next.has(code) ? next.delete(code) : next.add(code);
  ownedRunes.value = next;
};

/* Low runes come in order - you have everything up to some point, and then a
   few high ones you got lucky with. The slider is that point: it reads as the
   longest run from El that is ticked, and setting it only ever touches the
   runes inside that run, so the lucky Jah above it survives being dragged. */
const runeUpTo = computed(() => {
  let reached = 0;
  for (const rune of allRunes.value) {
    if (!ownedRunes.value.has(rune.code)) break;
    reached = rune.number;
  }
  return reached;
});

const runeUpToName = computed(() =>
  allRunes.value.find((rune) => rune.number === runeUpTo.value)?.name ?? '');

const setRuneUpTo = (target) => {
  const previous = runeUpTo.value;
  const next = new Set(ownedRunes.value);
  allRunes.value.forEach((rune) => {
    if (rune.number <= target) next.add(rune.code);
    else if (rune.number <= previous) next.delete(rune.code);
  });
  ownedRunes.value = next;
};

/* What the picked runes can make, counted against every runeword rather than
   against the current filters: "23 craftable" should not move because somebody
   is looking at shields. Grouped by row, so a runeword that goes in two kinds
   of item counts once. */
const craftable = computed(() => {
  const perTier = Object.fromEntries(RUNE_TIERS.map((tier) => [tier.key, 0]));
  const counted = new Set();
  let total = 0;

  runewords.value.forEach((runeword) => {
    if (counted.has(runeword.RowId)) return;
    counted.add(runeword.RowId);
    if (!(runeword.Runes ?? []).every((code) => ownedRunes.value.has(code))) return;
    total += 1;
    perTier[tierOf(runeword).key] += 1;
  });

  return { total, perTier, of: counted.size };
});

const selectAllRunes = () => { ownedRunes.value = new Set(allRunes.value.map((rune) => rune.code)); };
const clearRunes = () => { ownedRunes.value = new Set(); };

// Off while nothing is ticked: "only what I can make" out of no runes is an
// empty page, and an empty page is not an answer anyone asked for.
const runeFilterActive = computed(() => useRuneFilter.value && ownedRunes.value.size > 0);

watch(ownedRunes, (runes) => {
  writeSession(RUNES_KEY, [...runes]);
  // Touching the picker is the question being asked: arm the filter rather
  // than wait for a second click on the checkbox beside it. Emptying the
  // picker is not an answer, so that leaves the switch alone.
  if (runes.size > 0) {
    useRuneFilter.value = true;
  }
}, { deep: true });
watch(useRuneFilter, (on) => writeSession(RUNE_FILTER_KEY, on));

const selectGroup = (group) => {
  selectedGroup.value = selectedGroup.value?.key === group.key ? null : group;
};

/**
 * The three tiers the in-game menu already uses, by the highest rune a
 * runeword needs. High has no ceiling: the bound used to stop at Cham, and the
 * six runewords that ask for a Zod belonged to no tier at all.
 */
const RUNE_TIERS = [
  { key: 'low', title: 'Low Runewords', hint: 'El – Lum', max: 17 },
  { key: 'mid', title: 'Mid Runewords', hint: 'Ko – Gul', max: 25 },
  { key: 'high', title: 'High Runewords', hint: 'Vex – Zod', max: Infinity },
];

const highestRune = (runeword) =>
  Math.max(0, ...(runeword.Runes ?? []).map((code) => Number.parseInt(code.slice(1), 10) || 0));

const tierOf = (runeword) =>
  RUNE_TIERS.find((tier) => highestRune(runeword) <= tier.max) ?? RUNE_TIERS[RUNE_TIERS.length - 1];

const classBoundRows = computed(() => {
  const bound = new Map();
  runewords.value.forEach((runeword) => {
    const isBound = (runeword.ClassOnly ?? []).length > 0;
    bound.set(runeword.RowId, (bound.get(runeword.RowId) ?? true) && isBound);
  });
  return new Set([...bound].filter(([, isBound]) => isBound).map(([row]) => row));
});

// Every class a runeword is bound to, in the order charstats lists them.
const classOptions = computed(() => {
  const seen = [];
  runewords.value.forEach((runeword) => {
    (runeword.ClassNames ?? []).forEach((name) => {
      if (!seen.includes(name)) seen.push(name);
    });
  });
  return seen;
});

const visibleRunewords = computed(() => runewords.value.filter((runeword) => {
  if (classPick.value !== 'any') {
    // Bound to that class, and bound at all: an entry that also fits a plain
    // sword names no class, and would otherwise slip through on a sibling
    // entry's class list.
    if (!classBoundRows.value.has(runeword.RowId)) return false;
    if (!(runeword.ClassNames ?? []).includes(classPick.value)) return false;
  }
  if (classFilter.value === 'hide' && classBoundRows.value.has(runeword.RowId)) return false;
  if (classFilter.value === 'only' && !classBoundRows.value.has(runeword.RowId)) return false;
  if (statusFilter.value === 'new') return runeword.IsNew;
  if (statusFilter.value === 'reworked') return runeword.IsReworked;
  return true;
}));

// Filter runewords based on search queries and category
const filteredRunewords = computed(() => {
  let filtered = [...visibleRunewords.value];

  // What the picked runes can actually make
  if (runeFilterActive.value) {
    filtered = filtered.filter((runeword) =>
      (runeword.Runes ?? []).every((code) => ownedRunes.value.has(code)));
  }

  // Apply the item-kind filter
  if (selectedCategory.value !== 'all') {
    const matches = {
      weapons: (runeword) => runeword.IsWeapon,
      armors: (runeword) => runeword.IsTorso,
      helmets: (runeword) => runeword.IsHelmet,
      shields: (runeword) => runeword.IsShield,
    }[selectedCategory.value];
    if (matches) filtered = filtered.filter(matches);
  }

  // What fits the item you are holding, and how many sockets it has
  if (itemFilter.value !== ITEM_FILTER_ANY) {
    filtered = filtered.filter(fitsSelectedItem);
  }

  if (socketFilter.value !== 'any') {
    const sockets = Number(socketFilter.value);
    filtered = filtered.filter((runeword) => runeword.Sockets === sockets);
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
/* Every kind the entry names, not just the first one: Insight goes in
   polearms, staves, missile weapons and spears, and the page used to say
   "Polearm" and stop there. The row's own types, never the expanded ancestry -
   that would call every melee runeword a weapon runeword. */
const entryItemLabels = (runeword) => {
  const own = fieldOf(runeword, 'ItemTypes');
  const types = own?.length ? own : (fieldOf(runeword, 'AllowedItems') ?? []);

  const labels = [];
  types.forEach((code) => {
    const label = getAllowedItemsText([code]);
    if (!labels.includes(label)) labels.push(label);
  });

  // The exclusion belongs to the kind it narrows, which is the last one named:
  // "Shield (not Paladin Shield)".
  const excluded = fieldOf(runeword, 'ETypes') ?? [];
  if (excluded.length && labels.length) {
    labels[labels.length - 1] += ` (not ${getAllowedItemsText(excluded)})`;
  }

  return labels.length ? labels : ['None'];
};

const getEntryItemsText = (runeword) => entryItemLabels(runeword).join(', ');

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

// Enter closes the keyboard on a phone; the list is already filtered as you
// type. It used to scroll the page down to the results, which moved the ground
// under a reader who was still adjusting filters.
const handleSearchKeyup = (event) => {
  if (event.key === 'Enter') {
    event.target.blur();
  }
};

const setCategoryFilter = (category) => {
  selectedCategory.value = category;
};

// Reset filters
const resetFilters = () => {
  searchQuery.value = '';
  runesSearchQuery.value = '';
  selectedCategory.value = 'all';
  statusFilter.value = 'all';
  classFilter.value = 'all';
  classPick.value = 'any';
  itemFilter.value = ITEM_FILTER_ANY;
  socketFilter.value = 'any';
  useRuneFilter.value = false;
  sortBy.value = 'level';
  sortDir.value = 'asc';
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
        highestRune: highestRune(runeword),
        isNew: runeword.IsNew,
        isReworked: runeword.IsReworked && dataMode.value === 'mod',
        // Only where every variant is bound: a runeword that also fits a plain
        // sword is not "Sorceress Only", however many orbs it lists.
        classNames: classBoundRows.value.has(runeword.RowId) ? (runeword.ClassNames ?? []) : [],
        variants: [],
      });
    }

    const changes = runeword.IsReworked ? getReworkChanges(runeword) : [];
    groups.get(key).variants.push({
      label: getEntryItemsText(runeword),
      labels: entryItemLabels(runeword),
      properties: sortPropertiesByPriority(fieldOf(runeword, 'Properties') ?? []),
      reworkChanges: changes.length ? changes : null,
    });
  });

  return [...groups.values()];
};

/**
 * One list, cut into the three tiers. Sections used to double as filters -
 * "New" was a button and a table of its own - so the same runeword appeared
 * three times on one screen and no state said which view you were in.
 */
/* Sorting happens after grouping, so a runeword counts once however many
   kinds of item it fits - and inside its tier, because the tiers are the
   page's shape rather than a sort order. Name breaks every tie, so the list
   never shuffles between two runewords that compare equal. */
const compareGroups = (a, b) => {
  const by = {
    level: (group) => group.levelReq ?? 0,
    name: (group) => group.name.toLowerCase(),
    sockets: (group) => group.sockets ?? 0,
    rune: (group) => group.highestRune ?? 0,
  }[sortBy.value] ?? (() => 0);

  const left = by(a);
  const right = by(b);
  const order = left < right ? -1 : left > right ? 1 : 0;
  return (sortDir.value === 'desc' ? -order : order) || a.name.localeCompare(b.name);
};

const tiers = computed(() => RUNE_TIERS
  .map((tier) => ({
    ...tier,
    groups: toGroups(filteredRunewords.value
      .filter((runeword) => tierOf(runeword).key === tier.key))
      .sort(compareGroups),
  }))
  .filter((tier) => tier.groups.length > 0));

const resultCount = computed(() => tiers.value.reduce((total, tier) => total + tier.groups.length, 0));

const reworkTitle = computed(() =>
  dataMode.value === 'vanilla' ? 'Changes by Relics of Sanctuary' : 'Changes vs. vanilla');

/* ---- the link ------------------------------------------------------------
   Everything the page is showing, in the address bar: "a long staff with three
   sockets" is worth sending to somebody. Defaults stay out of the query, so a
   plain visit keeps a plain URL, and the query wins over the session when both
   have something to say - a link somebody sent should show what they saw. */
const route = useRoute();
const router = useRouter();

/* The query is read as the whole state, not as a set of overrides: going back
   to a link without "sort" has to mean the default sort, not whatever was set
   a moment ago. Which also makes reading idempotent, so writing the query back
   out cannot start a loop. */
const readQuery = () => {
  const query = route.query;
  const one = (value) => (Array.isArray(value) ? value[0] : value);
  const oneOf = (value, allowed, fallback) => (allowed.includes(one(value)) ? one(value) : fallback);

  searchQuery.value = one(query.q) ?? '';
  runesSearchQuery.value = one(query.runes) ?? '';
  selectedCategory.value = oneOf(query.cat, ['weapons', 'armors', 'helmets', 'shields'], 'all');
  dataMode.value = oneOf(query.data, ['vanilla'], 'mod');
  statusFilter.value = oneOf(query.status, ['new', 'reworked'], 'all');
  classFilter.value = oneOf(query.classes, ['hide', 'only'], 'all');
  classPick.value = oneOf(query.cls, classOptions.value, 'any');
  itemFilter.value = one(query.base) ?? ITEM_FILTER_ANY;
  socketFilter.value = Number(one(query.sock)) || 'any';
  sortBy.value = oneOf(query.sort, SORT_OPTIONS.map((option) => option.value), 'level');
  sortDir.value = oneOf(query.dir, ['asc', 'desc'], 'asc');

  // Somebody's runes are their own setting, so a link without them leaves the
  // picker alone - it only switches the filter off, so the link shows what the
  // person who sent it was looking at.
  const owned = one(query.own);
  if (owned) ownedRunes.value = new Set(owned.split(',').filter(Boolean));
  useRuneFilter.value = Boolean(owned);
};

watch(
  [searchQuery, runesSearchQuery, selectedCategory, dataMode, statusFilter, classFilter,
   classPick, itemFilter, socketFilter, sortBy, sortDir, useRuneFilter, ownedRunes],
  () => {
    router.replace({
      query: {
        ...(searchQuery.value ? { q: searchQuery.value } : {}),
        ...(runesSearchQuery.value ? { runes: runesSearchQuery.value } : {}),
        ...(selectedCategory.value !== 'all' ? { cat: selectedCategory.value } : {}),
        ...(dataMode.value !== 'mod' ? { data: dataMode.value } : {}),
        ...(statusFilter.value !== 'all' ? { status: statusFilter.value } : {}),
        ...(classFilter.value !== 'all' ? { classes: classFilter.value } : {}),
        ...(classPick.value !== 'any' ? { cls: classPick.value } : {}),
        ...(itemFilter.value !== ITEM_FILTER_ANY ? { base: itemFilter.value } : {}),
        ...(socketFilter.value !== 'any' ? { sock: String(socketFilter.value) } : {}),
        ...(sortBy.value !== 'level' ? { sort: sortBy.value } : {}),
        ...(sortDir.value !== 'asc' ? { dir: sortDir.value } : {}),
        // The runes only travel when they are doing something: 33 codes in a
        // link that filters nothing would be noise.
        ...(useRuneFilter.value && ownedRunes.value.size > 0
          ? { own: [...ownedRunes.value].join(',') }
          : {}),
      },
    });
  },
  { deep: true },
);

// Back and forward move the query without remounting anything, so the page
// follows it.
watch(() => route.query, readQuery);

onMounted(() => {
  runewords.value = runewordsData;
  readQuery();
  wideQuery.addEventListener('change', syncWide);
  // Belt and braces: some environments resize without firing the media query.
  window.addEventListener('resize', syncWide);
});

onUnmounted(() => {
  wideQuery.removeEventListener('change', syncWide);
  window.removeEventListener('resize', syncWide);
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

            <!-- Rune picker: which runes you have, and whether that filters -->
            <div class="mb-3">
              <div class="d-flex align-items-center flex-wrap gap-3">
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="pickerOpen = !pickerOpen">
                  {{ pickerOpen ? '▾' : '▸' }} My runes
                  <span class="picker-count">{{ ownedRunes.size }}/{{ allRunes.length }}</span>
                </button>
                <div class="form-check reworked-toggle mb-0">
                  <input id="rw-rune-filter" v-model="useRuneFilter" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="rw-rune-filter">Only what I can make</label>
                </div>
                <small v-if="useRuneFilter && ownedRunes.size === 0" class="text-muted">
                  pick a rune first
                </small>
              </div>

              <div v-if="ownedRunes.size > 0" class="craftable-line">
                <strong>{{ craftable.total }}</strong> of {{ craftable.of }} craftable
                <span v-for="tier in RUNE_TIERS" :key="tier.key" class="craftable-tier">
                  {{ tier.title.replace(' Runewords', '') }} {{ craftable.perTier[tier.key] }}
                </span>
              </div>

              <div v-show="pickerOpen" class="rune-picker">
                <div class="rune-grid">
                  <button
                    v-for="rune in allRunes"
                    :key="rune.code"
                    type="button"
                    class="rune-chip"
                    :class="{ 'is-owned': ownedRunes.has(rune.code) }"
                    @click="toggleRune(rune.code)"
                  >
                    {{ rune.name }}
                  </button>
                </div>
                <div class="rune-slider">
                  <label for="rw-rune-upto" class="rune-slider-label">
                    Up to
                    <strong>{{ runeUpToName || '—' }}</strong>
                  </label>
                  <input
                    id="rw-rune-upto"
                    type="range"
                    class="form-range"
                    min="0"
                    :max="allRunes.length"
                    :value="runeUpTo"
                    @input="setRuneUpTo(Number($event.target.value))"
                  />
                </div>

                <div class="d-flex gap-2 mt-2">
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="selectAllRunes">Select all</button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearRunes">Clear</button>
                </div>
              </div>
            </div>

            <!-- What fits the item in your hand: the base, and its sockets -->
            <div class="row g-3 mb-3">
              <div class="col-lg-7">
                <label class="form-label text-warning">Item base</label>
                <SearchableSelect
                  v-model="itemFilter"
                  :options="itemFilterOptions"
                  placeholder="Any item - type a base or a kind..."
                />
                <small class="text-muted">
                  Pick the base you found, or a whole kind: Crystal Sword, Sword, Melee Weapon.
                </small>
              </div>
              <div class="col-lg-5">
                <label class="form-label text-warning">Sockets</label>
                <div class="btn-group d-flex flex-wrap gap-2" role="group">
                  <button
                    type="button"
                    class="btn flex-fill"
                    :class="socketFilter === 'any' ? 'btn-secondary' : 'btn-outline-secondary'"
                    @click="socketFilter = 'any'"
                  >
                    Any
                  </button>
                  <button
                    v-for="count in socketOptions"
                    :key="count"
                    type="button"
                    class="btn flex-fill"
                    :class="socketFilter === count ? 'btn-secondary' : 'btn-outline-secondary'"
                    @click="socketFilter = count"
                  >
                    {{ count }}
                  </button>
                </div>
                <small v-if="selectedBase" class="text-muted">
                  A {{ selectedBase.Name }} holds up to {{ selectedBase.Sockets }}.
                </small>
              </div>
            </div>

            <!-- Category Filter Buttons -->
            <div class="mb-3">
              <label class="form-label text-warning">Filter by Item</label>
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
              <div class="d-flex flex-wrap gap-4 mt-2">
                <div class="form-check reworked-toggle">
                  <input id="rw-status-all" v-model="statusFilter" value="all" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-all">All</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-status-new" v-model="statusFilter" value="new" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-new">
                    Only new <span class="flag">•</span>
                  </label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-status-reworked" v-model="statusFilter" value="reworked" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-status-reworked">
                    {{ dataMode === 'vanilla' ? 'Only changed by mod' : 'Only reworked' }}
                    <span class="flag">•</span>
                  </label>
                </div>
              </div>
              <div class="d-flex flex-wrap gap-4 mt-2">
                <div class="form-check reworked-toggle">
                  <input id="rw-class-all" v-model="classFilter" value="all" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-all">All</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-class-hide" v-model="classFilter" value="hide" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-hide">Hide class specific</label>
                </div>
                <div class="form-check reworked-toggle">
                  <input id="rw-class-only" v-model="classFilter" value="only" class="form-check-input" type="radio" />
                  <label class="form-check-label" for="rw-class-only">Only class specific</label>
                </div>
                <!-- One class, when the question is what this character can
                     wear. It answers the three above, so it clears them. -->
                <div class="rw-inline-field">
                  <label class="form-label mb-0" for="rw-class-pick">Class</label>
                  <select id="rw-class-pick" v-model="classPick" class="form-select form-select-sm">
                    <option value="any">Any</option>
                    <option v-for="name in classOptions" :key="name" :value="name">{{ name }}</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Sort order, inside each tier -->
            <div class="d-flex flex-wrap align-items-end gap-3 mt-3">
              <div class="rw-inline-field">
                <label class="form-label mb-0" for="rw-sort">Sort by</label>
                <select id="rw-sort" v-model="sortBy" class="form-select form-select-sm">
                  <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :title="sortDir === 'asc' ? 'Ascending - click for descending' : 'Descending - click for ascending'"
                @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
              >
                {{ sortDir === 'asc' ? '↑ Ascending' : '↓ Descending' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Runewords, one list cut into rune tiers - with the open runeword's
         stats in a sticky panel beside it where the width allows. -->
    <div class="rw-layout" :class="{ 'has-panel': isWide }">
      <div class="rw-list row g-4">
        <div class="col-12" v-if="resultCount === 0">
          <div class="card card-enhanced">
            <div class="card-body text-center text-muted py-4">
              No runewords match the current filters.
            </div>
          </div>
        </div>

        <div class="col-12" v-for="tier in tiers" :key="tier.key">
          <RunewordTable
            :title="tier.title"
            :subtitle="tier.hint"
            :groups="tier.groups"
            :rework-title="reworkTitle"
            :panel-mode="isWide"
            :selected-key="selectedGroup?.key ?? null"
            @select="selectGroup"
          />
        </div>
      </div>

      <aside v-if="isWide" class="rw-panel">
        <div class="card card-enhanced rw-panel-card">
          <div class="card-body">
            <RunewordDetail
              v-if="selectedGroup"
              :group="selectedGroup"
              :rework-title="reworkTitle"
              show-header
            />
            <div v-else class="text-muted rw-panel-hint">
              Click a runeword to see its stats here.
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* A label and its control on one line, for the two that are not radio rows. */
.rw-inline-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rw-inline-field .form-select {
  width: auto;
  min-width: 9rem;
}

/* The same mark the table uses, so the filter labels double as its legend:
   the dot means the mod touched this runeword, and these two say which way. */
.flag {
  font-size: 0.7em;
  vertical-align: 0.35em;
  color: rgba(201, 163, 106, 0.75);
}

/* ---- rune picker ------------------------------------------------------- */
.craftable-line {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--d2r-muted);
}

.craftable-line strong {
  color: var(--d2r-gold-bright);
  font-variant-numeric: tabular-nums;
}

.craftable-tier {
  margin-left: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.craftable-tier::before {
  content: '·';
  margin-right: 0.9rem;
  opacity: 0.5;
}

.picker-count {
  margin-left: 0.4rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.rune-picker {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid rgba(59, 42, 31, 0.8);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.2);
}

.rune-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.rune-chip {
  min-width: 3.6rem;
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
  color: var(--d2r-muted);
  background: transparent;
  border: 1px solid rgba(59, 42, 31, 0.9);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.rune-chip:hover {
  border-color: rgba(201, 163, 106, 0.5);
  color: var(--d2r-text);
}

.rune-slider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.rune-slider-label {
  flex: none;
  font-size: 0.85rem;
  color: var(--d2r-muted);
  margin: 0;
}

.rune-slider-label strong {
  color: var(--d2r-gold-bright);
  font-variant-numeric: tabular-nums;
}

/* Bootstrap's range is white track and a blue thumb, which belongs to another
   site. Same control, this palette. */
.rune-slider .form-range {
  flex: 1 1 auto;
  width: auto;
  height: 1.1rem;
  background: transparent;
}

.rune-slider .form-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(201, 163, 106, 0.25);
}

.rune-slider .form-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(201, 163, 106, 0.25);
}

.rune-slider .form-range::-webkit-slider-thumb {
  margin-top: -5px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--d2r-gold);
  border: 1px solid rgba(20, 14, 10, 0.8);
  box-shadow: 0 0 6px rgba(201, 163, 106, 0.4);
}

.rune-slider .form-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--d2r-gold);
  border: 1px solid rgba(20, 14, 10, 0.8);
}

/* A rune you own reads as filled - the picker is a shelf, not a form. */
.rune-chip.is-owned {
  background: rgba(201, 163, 106, 0.18);
  border-color: rgba(201, 163, 106, 0.6);
  color: var(--d2r-gold-bright);
  font-weight: 600;
}

/* List and detail panel side by side. The panel sticks, so the stats stay put
   while the list scrolls under the cursor - which is the whole point.

   A grid rather than flex, and the list track is minmax(0, 1fr) on purpose: a
   track sized that way never asks its content how wide it would like to be.
   The tables inside report an absurd width when asked (a percentage-width
   table inside a scroll container answers with five hundred thousand pixels),
   and any layout that listens to that answer stretches the page off-screen. */
.rw-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 1.5rem;
}

.rw-layout.has-panel {
  grid-template-columns: minmax(0, 1fr) 23rem;
}

.rw-list {
  min-width: 0;
}

.rw-panel {
  min-width: 0;
  position: sticky;
  top: 1rem;
}

.rw-panel-card {
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}

.rw-panel-hint {
  padding: 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.9rem;
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

