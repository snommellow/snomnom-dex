#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import {
  buildVgxData, vgxCandidates, vgxPick,
  buildAncientTraitData, ancientTraitPick,
  toDisplayName,
} from "../lib/tcgapi";

async function main() {
  const vgxData = await buildVgxData();
  const atData = await buildAncientTraitData();

  const targets = [
    { id: 254, name: "sceptile" },
    { id: 306, name: "aggron" },
  ];

  const out: Record<string, unknown> = {};
  for (const t of targets) {
    const displayName = toDisplayName(t.name);
    const vgxCands = vgxCandidates(vgxData, displayName);
    const vgxResult = vgxPick(vgxCands, undefined);
    const atUrl = ancientTraitPick(atData, displayName);
    out[t.name] = {
      vgxCandidates: vgxCands.map(c => ({
        id: c.id, name: c.name, set: c.set.id, number: c.number,
        rarity: c._rarity, artist: c.artist, price: (c as any).tcgplayer?.prices,
      })),
      vgxResult,
      atUrl,
      atIndexHasKey: atData.index.has(displayName.toLowerCase()),
      atRawCandidates: (atData.index.get(displayName.toLowerCase()) ?? []).map(c => ({
        id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity,
      })),
    };
  }

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
