import icons from '@/assets/item_icons.json';

/**
 * The game's own icon for an item code. item_icons.json maps every code the
 * game draws to an image name; the images are the sprites converted by
 * `d2mod sprites --all`. A code without an image on disk yields null, so a
 * missing icon costs a chip nothing but the picture.
 */
const files = import.meta.glob('../assets/item_images/*.webp', { eager: true, query: '?url', import: 'default' });

export const iconByName = (name) => (name ? files[`../assets/item_images/${name}.webp`] ?? null : null);
export const iconUrl = (code) => iconByName(icons[code]);
/// Runes are named, not coded, in most places: "Thul" -> the Thul Rune icon.
export const runeIcon = (name) => iconByName(`rune_${String(name).replace(/ Rune$/i, '').toLowerCase()}_rune`);
