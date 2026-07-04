#!/usr/bin/env tsx
// Temporary debug script — verifies the full Chinese-exclusive promo pipeline for Ponyta
// end to end now that the zh-hant language key is fixed.
import { writeFileSync } from "fs";
import { fetchSpeciesData } from "../lib/pokeapi";
import { fetchChineseExclusivePromo } from "../lib/tcgdexZh";

async function main() {
  const species = await fetchSpeciesData(77); // Ponyta
  const result = await fetchChineseExclusivePromo(species.chineseName);
  writeFileSync("lib/debug-cards.json", JSON.stringify({ chineseName: species.chineseName, result }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
