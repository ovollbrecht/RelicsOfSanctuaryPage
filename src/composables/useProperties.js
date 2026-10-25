/**
 * A PickMode-0 group draws all of its entries, every time - "All 4 of:" on
 * Unholy Pact. Shown as a deck it reads like a choice; shown flat, each entry
 * is the plain stat it always is. Everything else keeps its roll list.
 */
export const flattenAllOf = (properties) => (properties ?? []).flatMap((prop) =>
  (prop.Rolls && /^All\b/i.test(prop.Description ?? '')
    ? prop.Rolls.map((roll) => ({ ...prop, Description: roll.Description, Rolls: undefined, Chance: roll.Chance ?? prop.Chance }))
    : [prop]));
