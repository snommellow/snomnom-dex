#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { buildVgxData, vgxCandidates, vgxPick } from "../lib/tcgapi";

async function main() {
  const vgxData = await buildVgxData();
  const cands = vgxCandidates(vgxData, "Skuntank");
  const out = {
    candidates: cands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
    result: vgxPick(cands, undefined),
  };
  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
