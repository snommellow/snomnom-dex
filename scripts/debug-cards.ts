#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { buildIrSirData, irSirCandidates, irSirPick, buildPromoSvData, promoSvPick, toDisplayName } from "../lib/tcgapi";

async function main() {
  const out: Record<string, unknown> = {};

  // Mewtwo: does the svp/52 image actually exist right now?
  const imgRes = await fetch("https://images.pokemontcg.io/svp/52_hires.png", { method: "HEAD" });
  out.svp52ImageStatus = imgRes.status;

  const promoData = await buildPromoSvData();
  out.mewtwoPromoPick = await promoSvPick(promoData, "Mewtwo");

  // Snorlax: what does irSirCandidates/irSirPick find, and why does ex7-104 win?
  const irData = await buildIrSirData();
  const snorlaxIrCands = irSirCandidates(irData, "Snorlax");
  out.snorlaxIrCandidates = snorlaxIrCands.map(c => ({
    id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist,
  }));
  out.snorlaxIrResult = irSirPick(snorlaxIrCands);
  out.snorlaxPromoPick = await promoSvPick(promoData, "Snorlax");

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
