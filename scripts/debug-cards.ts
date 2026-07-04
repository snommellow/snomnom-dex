#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import {
  buildIrSirData, irSirCandidates, irSirPick,
  buildVgxData, vgxCandidates, vgxPick,
  toDisplayName,
} from "../lib/tcgapi";

async function main() {
  const irData = await buildIrSirData();
  const vgxData = await buildVgxData();

  const targets = ["rayquaza"];

  const out: Record<string, unknown> = {};
  for (const name of targets) {
    const displayName = toDisplayName(name);
    const irCands = irSirCandidates(irData, displayName);
    const irResult = irSirPick(irCands);
    const vgxCands = vgxCandidates(vgxData, displayName);
    const vgxResult = vgxPick(vgxCands, undefined);

    out[name] = {
      irCandidates: irCands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
      irResult,
      vgxCandidates: vgxCands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
      vgxResult,
    };
  }

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
