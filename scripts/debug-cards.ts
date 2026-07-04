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

async function checkBase(name: string, dexId: number) {
  const displayName = toDisplayName(name);
  const [irData, promoData, vgxData, ancientTraitData, fallbackData] = await Promise.all([
    buildIrSirData(), buildPromoSvData(), buildVgxData(), buildAncientTraitData(), buildFallbackArtData(),
  ]);
  const irResult = irSirPick(irSirCandidates(irData, displayName));
  const promoUrl = await promoSvPick(promoData, displayName);
  const trainerIrUrl = trainerIrPick(irData, displayName);
  const vgxResult = vgxPick(vgxCandidates(vgxData, displayName));
  const ancientTraitUrl = ancientTraitPick(ancientTraitData, displayName);
  const fallbackUrl = fallbackArtPick(fallbackData, displayName);
  return { dexId, name, irResult, promoUrl, trainerIrUrl, vgxResult, ancientTraitUrl, fallbackUrl };
}

async function checkForm(displayName: string, category: "mega" | "regional" | "gmax", dexId: number, types: string[] = []) {
  const irForm = await fetchFormCard(category, dexId, displayName, types, IR_RARITIES);
  const vgxForm = await fetchFormCard(category, dexId, displayName, types, VGX_RARITIES);
  const lastResort = await fetchFormCardLastResort(displayName);
  return { displayName, irForm, vgxForm, lastResort };
}

async function main() {
  const results: Record<string, unknown> = {};
  results.fearow = await checkBase("fearow", 22);
  results.starmie = await checkBase("starmie", 121);
  results.granbull = await checkBase("granbull", 210);
  results.golem = await checkBase("golem", 76);
  results.scyther = await checkBase("scyther", 123);
  results.electabuzz = await checkBase("electabuzz", 125);
  results.megaMewtwoX = await checkForm("Mega Mewtwo X", "mega", 150, ["psychic"]);
  results.hisuianTyphlosion = await checkForm("Hisuian Typhlosion", "regional", 157, ["fire", "ghost"]);
  writeFileSync("lib/debug-cards.json", JSON.stringify(results, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
