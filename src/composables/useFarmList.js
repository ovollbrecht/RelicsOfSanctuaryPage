import { ref, computed, watch } from 'vue';

/**
 * The list of wanted items behind "Where to Farm", shared by every page that
 * offers a "+" - the uniques and sets pages, the drop calculator - and kept in
 * the browser. Items are named by kind and name ('u:Rainbow Facet',
 * 's:Tal Rasha's Lidless Eye'); a name covers every row that carries it, so
 * the eight facets and the four Elemental Attunements are one entry each.
 * 'ux:Exalted Shako' wants the Exalted roll of it and nothing else.
 */
const KEY = 'farm_list';

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((t) => typeof t === 'string' && /^[us]x?:.+/.test(t)) : [];
  } catch {
    return [];
  }
};

const tokens = ref(load());
watch(tokens, (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* no storage, no memory */ } }, { deep: true });

// 'ux:' / 'sx:' name the Exalted or Mythic variant alone; without the x a name
// covers the item whichever way it rolls
export const farmToken = (kind, name, variant = false) => `${kind === 'set' ? 's' : 'u'}${variant ? 'x' : ''}:${name}`;

export function useFarmList() {
  const has = (token) => tokens.value.includes(token);
  const add = (token) => { if (!has(token)) tokens.value = [...tokens.value, token]; };
  const remove = (token) => { tokens.value = tokens.value.filter((t) => t !== token); };
  const toggle = (token) => (has(token) ? remove(token) : add(token));
  const replace = (list) => { tokens.value = [...new Set(list)]; };
  const clear = () => { tokens.value = []; };
  const count = computed(() => tokens.value.length);
  return { tokens, has, add, remove, toggle, replace, clear, count };
}
