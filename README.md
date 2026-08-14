# Relics of Sanctuary — Website

Showcase site for the Diablo II: Resurrected mod **Relics of Sanctuary**
(relicsofsanctuary.com). Vue 3 + Vite, deployed to GitHub Pages.

## Data is generated — do not edit by hand

`src/assets/*.json` (unique_items, sets, runewords, crafting, propertygroups,
meta) and `src/assets/item_images/*.webp` are produced by the `d2mod`
toolchain in the D2ModTooling repo:

- `d2mod generate` (or `d2mod release`) writes the five data JSONs plus
  `meta.json` (generation timestamp + mod version, shown in the sidebar).
- `d2mod sprites` extracts the item images.
- `src/assets/item_mapping.json` is curated by hand; `d2mod generate` warns
  when an item type is missing from it (unmapped items disappear from the
  Uniques sidebar).

## Development

```bash
npm install
npm run dev
```

## Deploy

Deployment is **manual by design** — the site goes live together with the
Nexus Mods release:

1. Regenerate the data (`d2mod release`), commit, push.
2. GitHub → Actions → "Deploy to GitHub Pages" → Run workflow.

One-time setup: repo Settings → Pages → Source: "GitHub Actions"
(replaces the old hand-pushed `gh-pages` branch; `dist/` is no longer
tracked in git).
