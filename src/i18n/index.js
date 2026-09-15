import { ref } from 'vue';

/**
 * Two languages, one dictionary per page. The key is the English text as it
 * stands in the template; German comes from src/i18n/de/*.json, and a key with
 * no entry falls back to the English. Placeholders are {name}. Item, monster,
 * zone and rune names come from the data files and stay as the data has them.
 */
const files = import.meta.glob('./de/*.json', { eager: true });
const de = Object.assign({}, ...Object.values(files).map((m) => m.default ?? m));

const KEY = 'lang';
const detect = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch { /* no storage */ }
  return typeof navigator !== 'undefined' && /^de/i.test(navigator.language ?? '') ? 'de' : 'en';
};
export const locale = ref(detect());
export const setLocale = (lang) => {
  locale.value = lang === 'de' ? 'de' : 'en';
  try { localStorage.setItem(KEY, locale.value); } catch { /* fine */ }
  if (typeof document !== 'undefined') document.documentElement.lang = locale.value;
};
if (typeof document !== 'undefined') document.documentElement.lang = locale.value;

// 'Magic|quality' and 'Magic' may need different German; the part after the
// bar is context only and never shown
export function t(key, params) {
  const text = (locale.value === 'de' && de[key]) || key.split('|')[0];
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m)) : text;
}
// for toLocaleDateString and friends, where the page's language should win
export const dateLocale = () => (locale.value === 'de' ? 'de-DE' : 'en-GB');
export const useI18n = () => ({ t, locale, setLocale });
export const i18n = { install(app) { app.config.globalProperties.$t = t; app.config.globalProperties.$locale = locale; } };
