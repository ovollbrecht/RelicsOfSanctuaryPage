<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import runewordsData from '@/assets/runewords.json';
import itemMapping from '@/assets/item_mapping.json';
import itemBaseData from '@/assets/item_bases.json';
import cubeData from '@/assets/cube.json';
import { readLadder, planBuild, runeNumber } from '@/composables/useRuneLadder.js';
import { runeIcon } from '@/composables/useItemIcon.js';
import RunewordTable from '@/components/RunewordTable.vue';
import RunewordDetail from '@/components/RunewordDetail.vue';
import SearchableSelect from '@/components/SearchableSelect.vue';
import { useGrail } from '@/composables/useGrail.js';
import { t } from '@/i18n';

const runewords = ref([]);
const searchQuery = ref('');
const runesSearchQuery = ref('');
const selectedCategory = ref('all');
const dataMode = ref('mod'); // mod | vanilla (mod is the default)
watch(dataMode, (mode) => { if (mode === 'vanilla' && statusFilter.value === 'new') statusFilter.value = 'all'; });

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

// ---------- the Grail's word: what is built, what bases lie around ----------
const grail = useGrail();
const grailHasData = computed(() => Object.keys(grail.found.value).length > 0);
const builtKeys = ref(new Set()); // RowIds the Grail counts as built
const markBuilt = ref((() => { try { return localStorage.getItem('rw_mark_built') !== '0'; } catch { return true; } })());
watch(markBuilt, (v) => { try { localStorage.setItem('rw_mark_built', v ? '1' : '0'); } catch { /* fine */ } });
// the save catalog knows which ids a runeword saves under; it is only fetched
// when there is a Grail to compare against
let catalogPromise = null;
const skillNames = ref([]); // by skill row, for the staffmods on held bases
watch(grail.found, async (found) => {
  if (!Object.keys(found).length) { builtKeys.value = new Set(); return; }
  catalogPromise ??= import('@/assets/save_constants.json').then((m) => { const d = m.default ?? m; return { runewords: d.catalog.runewords, skills: d.constants.skills }; });
  const { runewords: catalog, skills } = await catalogPromise;
  skillNames.value = skills;
  builtKeys.value = new Set(catalog.filter((rw) => found[`r:${rw.id}`] || (rw.stringId != null && found[`rs:${rw.stringId}`])).map((rw) => rw.key));
}, { immediate: true });
const staffmodsText = (mods) => mods.map((m) => `+${m.level} ${skillNames.value[m.skill]?.s ?? t('skill {n}', { n: m.skill })}`).join(', ');

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
  { value: ITEM_FILTER_ANY, label: t('Any item') },
  ...itemBaseData.Types
    .map((type) => ({ value: `type:${type.Code}`, label: type.Name, hint: t('kind') }))
    .sort(byLabel),
  ...itemBaseData.Bases
    .map((base) => ({
      value: `base:${base.Code}`,
      label: base.Name,
      hint: t('{n} sockets max', { n: base.Sockets }),
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

    // A base can sit in two families: the mod gives the Cryptic Sword a second
    // type so one runeword can name that sword and nothing else.
    const chain = new Set([...chainOf(base.Type), ...(base.Type2 ? chainOf(base.Type2) : [])]);
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
const REACH_KEY = 'rw-rune-reach';

/* How far a missing rune may sit above the best one you own and still count as
   "one away". Runes up to Gul are farmable, so those always count; above that
   the question is whether you are in that league at all. Two tiers by default:
   with a Lo in the stash, "you are one Sur short" is worth hearing; with an El
   it is a joke. */
const FARMABLE_UP_TO = 25; // Gul
const DEFAULT_REACH = 2;

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
const runeReach = ref(Number(readSession(REACH_KEY, DEFAULT_REACH)) || DEFAULT_REACH);

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

/* ---- what the files hold, and what the cube can make of it -----------------
   Counted copies from the Grail's files where there are any, the picker's
   ticks otherwise; the maths is in useRuneLadder.js. */
const LADDER = readLadder(cubeData);
const GRAIL_RUNES_KEY = 'rw_grail_runes';
const UPGRADES_KEY = 'rw_rune_upgrades';
const readFlag = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v !== '0'; } catch { return fallback; } };
const writeFlag = (key, v) => { try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* fine */ } };
const useGrailRunes = ref(readFlag(GRAIL_RUNES_KEY, true));
const withUpgrades = ref(readFlag(UPGRADES_KEY, true));
watch(useGrailRunes, (v) => writeFlag(GRAIL_RUNES_KEY, v));
watch(withUpgrades, (v) => writeFlag(UPGRADES_KEY, v));
const grailRunes = computed(() => grail.owned.value.runes ?? {});
const grailRuneTotal = computed(() => Object.values(grailRunes.value).reduce((s, n) => s + n, 0));
const countedMode = computed(() => useGrailRunes.value && grailRuneTotal.value > 0);
// what there is to build from: counted copies out of the files, or the
// picker's ticks - a tick means "enough of it"
const runeStock = computed(() => (countedMode.value
  ? new Map(Object.entries(grailRunes.value).filter(([, n]) => n > 0))
  : new Map([...ownedRunes.value].map((code) => [code, 99]))));
const runeNameOf = (code) => allRunes.value.find((r) => r.code === code)?.name ?? code;
const grailBestRune = computed(() => runeNameOf(`r${String(Math.max(0, ...[...runeStock.value.keys()].map(runeNumber))).padStart(2, '0')}`));

const buildPlan = (runeword) => {
  const plan = planBuild(runeword.Runes, runeStock.value, LADDER, { upgrades: withUpgrades.value && countedMode.value });
  return {
    ...plan,
    missingNames: plan.missing.map(runeNameOf),
    upgradeText: plan.upgrades.map((u) => `${u.n > 1 ? `${u.n}× ` : ''}${runeNameOf(u.code)} (${u.qty} ${runeNameOf(u.from)})`).join(', '),
  };
};

/* The bill for the rest: every rune the runewords not built yet would take,
   one of each runeword, counted over the whole page rather than the current
   filters - and without subtracting what lies in the stash, since that is a
   shopping list, not a plan. Without a Grail, "the rest" is all of them. */
const billOpen = ref(readSession('rw-bill-open', false) === true);
watch(billOpen, (v) => writeSession('rw-bill-open', v));
const runeBill = computed(() => {
  const counts = new Map();
  const seen = new Set();
  let words = 0;
  for (const runeword of runewords.value) {
    if (dataMode.value === 'vanilla' && runeword.IsNew) continue;
    if (seen.has(runeword.RowId) || builtKeys.value.has(runeword.RowId)) continue;
    seen.add(runeword.RowId);
    words++;
    for (const code of runeword.Runes ?? []) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const runes = allRunes.value.filter((r) => counts.has(r.code)).map((r) => ({ ...r, n: counts.get(r.code) }));
  const total = runes.reduce((s, r) => s + r.n, 0);
  const high = runes.filter((r) => r.number >= 26).reduce((s, r) => s + r.n, 0);
  return { runes, total, high, words };
});

/* What the picked runes can make, counted against every runeword rather than
   against the current filters: "23 craftable" should not move because somebody
   is looking at shields. Grouped by row, so a runeword that goes in two kinds
   of item counts once. */
const craftable = computed(() => {
  const perTier = Object.fromEntries(RUNE_TIERS.map((tier) => [tier.key, 0]));
  const counted = new Set();
  let total = 0;

  let viaCube = 0;
  runewords.value.forEach((runeword) => {
    if (counted.has(runeword.RowId)) return;
    counted.add(runeword.RowId);
    const state = buildPlan(runeword).state;
    if (!state) return;
    total += 1;
    if (state === 'upgrade') viaCube += 1;
    perTier[tierOf(runeword).key] += 1;
  });

  return { total, viaCube, perTier, of: counted.size };
});

const selectAllRunes = () => { ownedRunes.value = new Set(allRunes.value.map((rune) => rune.code)); };
const clearRunes = () => { ownedRunes.value = new Set(); };

// Off while nothing is ticked: "only what I can make" out of no runes is an
// empty page, and an empty page is not an answer anyone asked for.
const runeFilterActive = computed(() => useRuneFilter.value && runeStock.value.size > 0);

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
watch(runeReach, (reach) => writeSession(REACH_KEY, reach));

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
  // the vanilla view shows the game as shipped: the mod's own runewords are not in it
  if (dataMode.value === 'vanilla' && runeword.IsNew) return false;
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
  if (statusFilter.value === 'unbuilt') return !builtKeys.value.has(runeword.RowId);
  return true;
}));

/* Everything except the runes you own, because two lists come out of this
   one: what you can build, and what you are one rune short of. */
const filteredIgnoringRunes = computed(() => {
  let filtered = [...visibleRunewords.value];

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

const filteredRunewords = computed(() => (runeFilterActive.value
  ? filteredIgnoringRunes.value.filter((runeword) => buildPlan(runeword).state != null)
  : filteredIgnoringRunes.value));

/* The best rune in the stash, which is what makes a near miss worth saying:
   "one Sur short" means something to somebody who already found a Lo. */
const bestOwnedRune = computed(() =>
  Math.max(0, ...[...runeStock.value.keys()].map(runeNumber)));

/* One rune short - and only when that rune is within reach. Duplicates are not
   counted, here as everywhere on this page: the picker cannot say "two Hels",
   so a runeword asking twice for a rune you have counts as having it. */
const nearMisses = computed(() => {
  if (!runeFilterActive.value) return [];

  const rows = filteredIgnoringRunes.value
    .map((runeword) => {
      const missing = buildPlan(runeword).missing;
      if (missing.length !== 1) return null;

      const number = runeNumber(missing[0]);
      const inReach = number <= FARMABLE_UP_TO || bestOwnedRune.value >= number - runeReach.value;
      return inReach ? { runeword, missing: missing[0], number } : null;
    })
    .filter(Boolean);

  const nameByCode = new Map(allRunes.value.map((rune) => [rune.code, rune.name]));
  const missingByRow = new Map(rows.map((row) => [row.runeword.RowId, row]));
  return toGroups(rows.map((row) => row.runeword))
    .map((group) => {
      const row = missingByRow.get(group.key);
      return {
        ...group,
        missingNames: [nameByCode.get(row.missing) ?? row.missing],
        missingNumber: row.number,
      };
    })
    // Closest first: the rune you are most likely to see next.
    .sort((a, b) => a.missingNumber - b.missingNumber || a.name.localeCompare(b.name));
});

// Get human-readable allowed items
const getAllowedItemsText = (allowedItems) => {
  if (!allowedItems || allowedItems.length === 0) return t('None');

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

  // The exclusion belongs to the kind it narrows, which is the kind it sits
  // under: Anathema goes in shields and grimoires and not in paladin shields,
  // and a paladin shield is a shield - so the note goes on "Shield". Only when
  // nothing here contains it does it fall to the last kind named.
  const excluded = fieldOf(runeword, 'ETypes') ?? [];
  if (excluded.length && labels.length) {
    const parent = types.findIndex((type) =>
      excluded.some((code) => code !== type && chainOf(code).has(type)));
    const at = parent >= 0 ? Math.min(parent, labels.length - 1) : labels.length - 1;
    labels[at] += ` ${t('(not {items})', { items: getAllowedItemsText(excluded) })}`;
  }

  return labels.length ? labels : [t('None')];
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
      label: t('Usable in'),
      old: getAllowedItemsText(runeword.VanillaAllowedItems),
      new: getAllowedItemsText(fieldOf(runeword, 'AllowedItems'))
    });
  }

  if (runeword.VanillaRuneNames) {
    changes.push({
      label: t('Runes'),
      old: runeword.VanillaRuneNames.join(' - '),
      new: fieldOf(runeword, 'RuneNames').join(' - ')
    });
  }

  return changes;
};

// One box for both searches. Rune names are a closed list, so a query made of
// nothing but rune names is a rune search and anything else is a name.
const searchText = computed(() => runesSearchQuery.value || searchQuery.value);
const onSearch = (event) => {
  const value = event.target.value;
  clearTimeout(debounceTimeout.value);
  debounceTimeout.value = setTimeout(() => {
    const names = new Set(allRunes.value.map((r) => r.name.toLowerCase()));
    const tokens = value.split(/[\s,]+/).filter(Boolean);
    const isRunes = tokens.length > 0 && tokens.every((t) => names.has(t.toLowerCase()));
    runesSearchQuery.value = isRunes ? value : '';
    searchQuery.value = isRunes ? '' : value;
  }, 300);
};
const clearSearch = () => { clearTimeout(debounceTimeout.value); searchQuery.value = ''; runesSearchQuery.value = ''; };

const KINDS = [
  { id: 'all', label: 'All' }, { id: 'weapons', label: 'Weapons' }, { id: 'armors', label: 'Armors' },
  { id: 'helmets', label: 'Helmets' }, { id: 'shields', label: 'Shields' },
];

// The class question as one control: keep, hide, or one class by name.
const classSelect = computed({
  get: () => (classPick.value !== 'any' ? classPick.value : classFilter.value),
  set: (v) => { if (v === 'all' || v === 'hide' || v === 'only') { classPick.value = 'any'; classFilter.value = v; } else classPick.value = v; },
});

const filtersActive = computed(() => Boolean(searchQuery.value || runesSearchQuery.value) || selectedCategory.value !== 'all'
  || statusFilter.value !== 'all' || classFilter.value !== 'all' || classPick.value !== 'any' || itemFilter.value !== ITEM_FILTER_ANY
  || socketFilter.value !== 'any' || useRuneFilter.value || sortBy.value !== 'level' || sortDir.value !== 'asc');

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
  runeReach.value = DEFAULT_REACH;
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
        built: builtKeys.value.has(runeword.RowId),
        build: runeStock.value.size ? buildPlan(runeword) : null,
        rows: [],
        variants: [],
      });
    }
    groups.get(key).rows.push({ own: runeword.ItemTypes ?? [], excluded: runeword.ETypes ?? [] });

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
// The bases in the files that this runeword would go into: the socket count
// has to match exactly, and the base's type chain has to reach one of the
// runeword's types without touching an excluded one.
// An unsocketed base can still become several things: the item level caps
// the sockets (3 to level 25, 4 to 40, then the base's own), a plain one takes
// any count up to that through the cube, a superior one only the maximum
// Larzuk punches.
const socketCap = (ilvl) => (ilvl <= 25 ? 3 : ilvl <= 40 ? 4 : 6);
const basesFor = (group) => {
  const out = [];
  for (const held of grail.bases.value) {
    const base = baseByCode.get(held.code);
    if (!base || !base.Sockets) continue;
    const most = Math.min(base.Sockets, socketCap(held.ilvl));
    let how;
    if (held.sockets > 0) { if (held.sockets !== group.sockets) continue; how = held.sockets === 1 ? t('1 open socket') : t('{n} open sockets', { n: held.sockets }); }
    else if (held.superior) { if (group.sockets !== most) continue; how = t('superior, {n} from Larzuk', { n: most }); }
    else { if (group.sockets > most) continue; how = t('unsocketed, up to {n}', { n: most }); }
    const chain = new Set([...chainOf(base.Type), ...(base.Type2 ? chainOf(base.Type2) : [])]);
    const fits = group.rows.some((row) => !row.excluded.some((t) => chain.has(t)) && row.own.some((t) => chain.has(t)));
    if (!fits) continue;
    // two Diadems at different item levels read the same - one line, counted
    const mods = staffmodsText(held.mods ?? []);
    const same = out.find((b) => b.name === base.Name && b.how === how && b.eth === held.eth && b.where === held.where && b.mods === mods);
    if (same) same.count += held.count; else out.push({ name: base.Name, how, eth: held.eth, mods, where: held.where, count: held.count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.where.localeCompare(b.where));
};

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
  dataMode.value === 'vanilla' ? t('Changes by Relics of Sanctuary') : t('Changes vs. vanilla'));

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
  statusFilter.value = oneOf(query.status, ['new', 'reworked', 'unbuilt'], 'all');
  classFilter.value = oneOf(query.classes, ['hide', 'only'], 'all');
  classPick.value = oneOf(query.cls, classOptions.value, 'any');
  itemFilter.value = one(query.base) ?? ITEM_FILTER_ANY;
  socketFilter.value = Number(one(query.sock)) || 'any';
  sortBy.value = oneOf(query.sort, SORT_OPTIONS.map((option) => option.value), 'level');
  sortDir.value = oneOf(query.dir, ['asc', 'desc'], 'asc');
  const reach = Number(one(query.reach));
  runeReach.value = one(query.reach) !== undefined && Number.isFinite(reach) && reach >= 0
    ? reach
    : DEFAULT_REACH;

  // Somebody's runes are their own setting, so a link without them leaves the
  // picker alone - it only switches the filter off, so the link shows what the
  // person who sent it was looking at.
  const owned = one(query.own);
  if (owned) ownedRunes.value = new Set(owned.split(',').filter(Boolean));
  useRuneFilter.value = Boolean(owned);
};

watch(
  [searchQuery, runesSearchQuery, selectedCategory, dataMode, statusFilter, classFilter,
   classPick, itemFilter, socketFilter, sortBy, sortDir, useRuneFilter, ownedRunes, runeReach],
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
        ...(runeReach.value !== DEFAULT_REACH && useRuneFilter.value
          ? { reach: String(runeReach.value) } : {}),
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
          {{ $t('Runewords') }} 
          <span class="title-icon">◆</span>
        </h1>
      </div>
    </div>

    <!-- Search and filters: three lines. Find it, narrow it, and what is yours. -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card card-enhanced filters-panel">
          <div class="card-body">
            <!-- 1. find: one box for a name or for runes, the base in your hand, the order -->
            <div class="row g-2 align-items-center">
              <div class="col-lg-4">
                <div class="input-group search-input-group">
                  <input
                    id="rwSearch"
                    type="text"
                    class="form-control search-input"
                    :placeholder="$t('Name, or runes: Jah Ber')"
                    :title="$t('A runeword\'s name - or rune names, which finds every runeword using them')"
                    :value="searchText"
                    @input="onSearch"
                    @keyup="handleSearchKeyup"
                  >
                  <button v-if="searchText" class="btn btn-outline-secondary" type="button" :title="$t('Clear the search')" @click="clearSearch">×</button>
                </div>
              </div>
              <div class="col-lg-4">
                <SearchableSelect
                  v-model="itemFilter"
                  :options="itemFilterOptions"
                  :placeholder="$t('Any item base or kind…')"
                />
              </div>
              <div class="col-lg-2">
                <div class="btn-group btn-group-sm d-flex" role="group" :title="$t('Sockets')">
                  <button type="button" class="btn flex-fill" :class="socketFilter === 'any' ? 'btn-secondary' : 'btn-outline-secondary'" @click="socketFilter = 'any'">{{ $t('Any') }}</button>
                  <button v-for="count in socketOptions" :key="count" type="button" class="btn flex-fill" :class="socketFilter === count ? 'btn-secondary' : 'btn-outline-secondary'" @click="socketFilter = count">{{ count }}</button>
                </div>
              </div>
              <div class="col-lg-2 d-flex gap-1">
                <select id="rw-sort" v-model="sortBy" class="form-select form-select-sm flex-grow-1" :title="$t('Sort by')">
                  <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ $t(option.label) }}</option>
                </select>
                <button type="button" class="btn btn-sm btn-outline-secondary flex-shrink-0" :title="sortDir === 'asc' ? $t('Ascending - click for descending') : $t('Descending - click for ascending')" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">{{ sortDir === 'asc' ? '↑' : '↓' }}</button>
              </div>
            </div>
            <small v-if="selectedBase" class="text-muted d-block mt-1">{{ $t('A {name} holds up to {n} sockets.', { name: selectedBase.Name, n: selectedBase.Sockets }) }}</small>

            <!-- 2. narrow: kind, the mod's marks, class, and which data -->
            <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <div class="btn-group btn-group-sm" role="group" :title="$t('Kind of item')">
                <button v-for="kind in KINDS" :key="kind.id" type="button" class="btn" :class="selectedCategory === kind.id ? 'btn-secondary' : 'btn-outline-secondary'" @click="setCategoryFilter(kind.id)">{{ $t(kind.label) }}</button>
              </div>
              <div class="btn-group btn-group-sm" role="group" :title="$t('The dot in the table: new to the mod, or reworked by it')">
                <button type="button" class="btn" :class="statusFilter === 'all' ? 'btn-secondary' : 'btn-outline-secondary'" @click="statusFilter = 'all'">{{ $t('All') }}</button>
                <button v-if="dataMode !== 'vanilla'" type="button" class="btn" :class="statusFilter === 'new' ? 'btn-secondary' : 'btn-outline-secondary'" @click="statusFilter = 'new'">{{ $t('New') }} <span class="flag">•</span></button>
                <button type="button" class="btn" :class="statusFilter === 'reworked' ? 'btn-secondary' : 'btn-outline-secondary'" @click="statusFilter = 'reworked'">{{ dataMode === 'vanilla' ? $t('Changed by mod') : $t('Reworked') }} <span class="flag">•</span></button>
                <button v-if="grailHasData" type="button" class="btn" :class="statusFilter === 'unbuilt' ? 'btn-secondary' : 'btn-outline-secondary'" :title="$t('Runewords your Grail has not seen built')" @click="statusFilter = 'unbuilt'">{{ $t('Unbuilt') }}</button>
              </div>
              <select id="rw-class" v-model="classSelect" class="form-select form-select-sm w-auto" :title="$t('Class-specific runewords: keep, hide, or one class')">
                <option value="all">{{ $t('Any class') }}</option>
                <option value="only">{{ $t('Class-specific only') }}</option>
                <option value="hide">{{ $t('No class-specific') }}</option>
                <option disabled>──────</option>
                <option v-for="name in classOptions" :key="name" :value="name">{{ name }}</option>
              </select>
              <div class="btn-group btn-group-sm ms-lg-auto" role="group" :title="$t('Which data the page reads')">
                <button type="button" class="btn" :class="dataMode === 'mod' ? 'btn-secondary' : 'btn-outline-secondary'" @click="dataMode = 'mod'">Relics</button>
                <button type="button" class="btn" :class="dataMode === 'vanilla' ? 'btn-secondary' : 'btn-outline-secondary'" @click="dataMode = 'vanilla'">Vanilla</button>
              </div>
              <button v-if="filtersActive" type="button" class="btn btn-sm btn-link text-decoration-none px-1" @click="resetFilters">{{ $t('Reset') }}</button>
            </div>

            <!-- 3. yours: the runes you hold and what they say -->
            <div class="rw-yours d-flex flex-wrap align-items-center gap-3 mt-2">
              <button v-if="!countedMode" type="button" class="btn btn-sm btn-outline-secondary" @click="pickerOpen = !pickerOpen">
                {{ pickerOpen ? '▾' : '▸' }} {{ $t('My runes') }}
                <span class="picker-count">{{ ownedRunes.size }}/{{ allRunes.length }}</span>
              </button>
              <span v-else :title="$t('The loose runes in the save files you gave the Grail, counted')">
                {{ $t('My runes:') }} <strong>{{ grailRuneTotal }}</strong> {{ $t('from the Grail, best {rune}', { rune: grailBestRune }) }}
              </span>
              <div v-if="grailRuneTotal > 0" class="form-check reworked-toggle mb-0" :title="$t('Count the runes in your imported save files instead of ticking them by hand')">
                <input id="rw-grail-runes" v-model="useGrailRunes" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-grail-runes">{{ $t('From my Grail') }}</label>
              </div>
              <div v-if="countedMode" class="form-check reworked-toggle mb-0" :title="$t('A missing rune counts as had when the ones below it in the cube\'s ladder are there - three Ist are a Gul')">
                <input id="rw-rune-upgrades" v-model="withUpgrades" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-rune-upgrades">{{ $t('Count cube upgrades') }}</label>
              </div>
              <div class="form-check reworked-toggle mb-0">
                <input id="rw-rune-filter" v-model="useRuneFilter" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-rune-filter">{{ $t('Only what I can make') }}</label>
              </div>
              <small v-if="useRuneFilter && runeStock.size === 0" class="text-muted">{{ $t('pick a rune first') }}</small>
              <span v-if="runeStock.size > 0" class="craftable-line">
                <strong>{{ craftable.total }}</strong> {{ $t('of {total} craftable', { total: craftable.of }) }}<template v-if="craftable.viaCube">, {{ $t('{n} via the cube', { n: craftable.viaCube }) }}</template>
                <span v-for="tier in RUNE_TIERS" :key="tier.key" class="craftable-tier">{{ $t(tier.title.replace(' Runewords', '')) }} {{ craftable.perTier[tier.key] }}</span>
                <span v-if="nearMisses.length" class="craftable-tier">{{ $t('{n} one rune away', { n: nearMisses.length }) }}</span>
              </span>
              <!-- How far a missing high rune may sit above your best one and
                   still count as "one away". Gul and below always do. Only
                   asked once the filter is on, since only then is it heard. -->
              <div v-if="runeFilterActive" class="rw-inline-field reach-field" :title="$t('A missing rune above Gul only counts when it is this close to the best rune you own.')">
                <label class="form-label mb-0" for="rw-rune-reach">{{ $t('one away: within') }}</label>
                <input id="rw-rune-reach" v-model.number="runeReach" class="form-control form-control-sm reach-input" type="number" min="0" max="10" />
                <span>{{ $t('of my best') }}</span>
              </div>
              <div v-if="grailHasData" class="form-check form-switch reworked-toggle mb-0 ms-lg-auto">
                <input id="rw-mark-built" v-model="markBuilt" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="rw-mark-built" :title="$t('A green edge on every runeword your Grail import has seen built')">{{ $t('Mark what I built') }}</label>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" :class="{ 'ms-lg-auto': !grailHasData }" :title="$t('Every rune the runewords not built yet would take, one of each - what you already hold is not subtracted')" @click="billOpen = !billOpen">
                {{ billOpen ? '▾' : '▸' }} {{ $t('What the rest needs') }}
              </button>
            </div>

            <!-- The bill: rune by rune, in rune order -->
            <div v-show="billOpen" class="rune-bill">
              <div class="small text-muted mb-2">
                <template v-if="grailHasData">{{ runeBill.words === 1 ? $t('1 runeword not built yet takes') : $t('{n} runewords not built yet take', { n: runeBill.words }) }}</template>
                <template v-else>{{ $t('All {n} runewords take', { n: runeBill.words }) }}</template>
                <strong class="ms-1">{{ runeBill.total }}</strong> {{ $t('runes, {n} of them Vex or higher. One of each runeword; what you already hold is not counted.', { n: runeBill.high }) }}
              </div>
              <div class="rune-grid">
                <span v-for="rune in runeBill.runes" :key="rune.code" class="rune-chip bill-chip" :class="{ 'is-high': rune.number >= 26 }">
                  <img v-if="runeIcon(rune.name)" :src="runeIcon(rune.name)" class="rune-icon" alt="" />{{ rune.name }} <span class="bill-n">×{{ rune.n }}</span>
                </span>
              </div>
            </div>

            <div v-show="pickerOpen && !countedMode" class="rune-picker">
              <div class="rune-grid">
                <button v-for="rune in allRunes" :key="rune.code" type="button" class="rune-chip" :class="{ 'is-owned': ownedRunes.has(rune.code) }" @click="toggleRune(rune.code)">{{ rune.name }}</button>
              </div>
              <div class="rune-slider">
                <label for="rw-rune-upto" class="rune-slider-label">{{ $t('Up to') }} <strong>{{ runeUpToName || '—' }}</strong></label>
                <input id="rw-rune-upto" type="range" class="form-range" min="0" :max="allRunes.length" :value="runeUpTo" @input="setRuneUpTo(Number($event.target.value))" />
              </div>
              <div class="d-flex gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="selectAllRunes">{{ $t('Select all') }}</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearRunes">{{ $t('Clear') }}</button>
              </div>
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
              {{ $t('No runewords match the current filters.') }}
            </div>
          </div>
        </div>

        <div class="col-12" v-for="tier in tiers" :key="tier.key">
          <RunewordTable
            :title="$t(tier.title)"
            :subtitle="tier.hint"
            :groups="tier.groups"
            :mark-built="markBuilt && grailHasData"
            :bases-for="grailHasData ? basesFor : null"
            :rework-title="reworkTitle"
            :panel-mode="isWide"
            :selected-key="selectedGroup?.key ?? null"
            @select="selectGroup"
          />
        </div>

        <!-- What one more rune would buy you. Below the three tiers and only
             while the picker is filtering, since without it there is nothing
             to be short of. -->
        <div class="col-12" v-if="nearMisses.length" >
          <RunewordTable
            class="near-miss-table"
            :title="$t('One rune away')"
            :subtitle="$t('with the runes you have')"
            :groups="nearMisses"
            :mark-built="markBuilt && grailHasData"
            :bases-for="grailHasData ? basesFor : null"
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
              :bases="grailHasData ? basesFor(selectedGroup) : []"
              :built="markBuilt && grailHasData && selectedGroup.built"
              show-header
            />
            <div v-else class="text-muted rw-panel-hint">
              {{ $t('Click a runeword to see its stats here.') }}
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* The near-miss reach sits with the picker it belongs to, and stays quiet. */
.reach-field {
  font-size: 0.85rem;
  color: var(--d2r-muted);
}

.reach-field .form-label {
  color: inherit;
}

.reach-input {
  width: 3.6rem;
}

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
.rw-yours { font-size: 0.85rem; }
.rune-bill { margin-top: 0.75rem; padding: 0.75rem; border: 1px solid rgba(59, 42, 31, 0.8); border-radius: var(--radius-sm); background: rgba(0, 0, 0, 0.2); }
.bill-chip { display: inline-flex; align-items: center; gap: 0.3rem; cursor: default; }
.bill-chip .rune-icon { width: 1.1rem; height: 1.1rem; display: inline-block; object-fit: contain; }
.bill-chip .bill-n { color: var(--d2r-gold-bright); font-variant-numeric: tabular-nums; font-weight: 600; }
.bill-chip.is-high { border-color: rgba(224, 184, 90, 0.5); }
.filters-panel .btn-group-sm .btn { white-space: nowrap; }
/* the theme stretches every button to full width on a phone; these sit in
   groups and beside selects, and stretched they push their neighbours out */
.filters-panel .btn { width: auto; }
.craftable-line {
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

