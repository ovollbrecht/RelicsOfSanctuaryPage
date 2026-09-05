# d2s parser, vendored

`src/` is the `third-party/d2s` folder of D2RMM (https://github.com/olegbl/d2rmm,
MIT, Oleg Lokhvitsky), itself a fork of https://github.com/dschu012/d2s. Two
edits: the `shared/i18n` import points at `shims/shared/i18n.ts` (a plain Error
in place of a translated one), and the type-only `bridge/...` import resolves
to `shims/bridge/...` (erased on build). Nothing else is changed.

`node scripts/vendor-d2s/build.mjs` writes `src/vendor/d2s.js` - the bundle
the Grail page imports. Re-vendor when D2R changes its save format: copy the
folder over, apply the two edits, rebuild.

Taken from D2RMM master at 2026-07-26 (item version 0x69, RotW).
