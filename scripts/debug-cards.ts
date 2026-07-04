#!/usr/bin/env tsx
// Temporary debug script — for each hardcoded Pokémon/form, find what the automated
// pipeline would pick WITHOUT the hardcode override, so we can convert plain overrides
// into targeted blacklist exclusions instead (letting a genuinely better future card
// compete normally rather than being permanently masked).
import { writeFileSync } from "fs";
import {
  buildIrSirData, irSirCandidates, irSirPick, trainerIrPick,
  buildPromoSvData, promoSvPick,
  buildVgxData, vgxCandidates, vgxPick,
  buildAncientTraitData, ancientTraitPick,
  buildFallbackArtData, fallbackArtPick,
  fetchFormCard, fetchFormCardLastResort,
  toDisplayName,
  IR_RARITIES, VGX_RARITIES,
} from "../lib/tcgapi";

async function main() {
  console.log("Building shared indexes once...");
  const [irData, promoData, vgxData, ancientTraitData, fallbackData] = await Promise.all([
    buildIrSirData(), buildPromoSvData(), buildVgxData(), buildAncientTraitData(), buildFallbackArtData(),
  ]);

  function checkBase(name: string) {
    const displayName = toDisplayName(name);
    const irResult = irSirPick(irSirCandidates(irData, displayName));
    const vgxResult = vgxPick(vgxCandidates(vgxData, displayName));
    const ancientTraitUrl = ancientTraitPick(ancientTraitData, displayName);
    const fallbackUrl = fallbackArtPick(fallbackData, displayName);
    return { name, irResult, trainerIrUrl: trainerIrPick(irData, displayName), vgxResult, ancientTraitUrl, fallbackUrl };
  }

  const results: Record<string, unknown> = {
    fearow: checkBase("fearow"),
    starmie: checkBase("starmie"),
    granbull: checkBase("granbull"),
    golem: checkBase("golem"),
    scyther: checkBase("scyther"),
    electabuzz: checkBase("electabuzz"),
  };

  // Promo pass needs awaiting (verifies image existence) — run after the sync checks.
  for (const name of ["fearow", "starmie", "granbull", "golem", "scyther", "electabuzz"]) {
    (results[name] as Record<string, unknown>).promoUrl = await promoSvPick(promoData, toDisplayName(name));
  }

  console.log("Checking alt forms...");
  results.megaMewtwoX = {
    irForm: await fetchFormCard("mega", 150, "Mega Mewtwo X", ["psychic"], IR_RARITIES),
    vgxForm: await fetchFormCard("mega", 150, "Mega Mewtwo X", ["psychic"], VGX_RARITIES),
    lastResort: await fetchFormCardLastResort("Mega Mewtwo X"),
  };
  results.hisuianTyphlosion = {
    irForm: await fetchFormCard("regional", 157, "Hisuian Typhlosion", ["fire", "ghost"], IR_RARITIES),
    vgxForm: await fetchFormCard("regional", 157, "Hisuian Typhlosion", ["fire", "ghost"], VGX_RARITIES),
    lastResort: await fetchFormCardLastResort("Hisuian Typhlosion"),
  };

  writeFileSync("lib/debug-cards.json", JSON.stringify(results, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
