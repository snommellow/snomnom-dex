#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { buildVgxData, vgxCandidates, vgxPick } from "../lib/tcgapi";

async function main() {
  const out: Record<string, unknown> = {};
  const vgxData = await buildVgxData();

  for (const name of ["Darkrai", "Dialga", "Lucario"]) {
    const cands = vgxCandidates(vgxData, name);
    out[name] = {
      candidates: cands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
      result: vgxPick(cands, undefined),
    };
  }

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
