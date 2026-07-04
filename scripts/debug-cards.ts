#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import {
  buildIrSirData, irSirCandidates, irSirPick,
  buildPromoSvData, promoSvPick, trainerPromoPick,
  buildVgxData, vgxCandidates, vgxPick,
  toDisplayName,
} from "../lib/tcgapi";

async function main() {
  const irData = await buildIrSirData();
  const vgxData = await buildVgxData();
  const promoData = await buildPromoSvData();

  const targets = ["kyogre", "jirachi"];

  const out: Record<string, unknown> = {};
  for (const name of targets) {
    const displayName = toDisplayName(name);
    const irCands = irSirCandidates(irData, displayName);
    const irResult = irSirPick(irCands);
    const vgxCands = vgxCandidates(vgxData, displayName);
    const vgxResult = vgxPick(vgxCands, undefined);
    const promoUrl = await promoSvPick(promoData, displayName);
    const trainerPromoUrl = await trainerPromoPick(promoData, displayName);

    // Raw scan of vgx indexes for trainer-owned cards (bypassing vgxCandidates' default
    // exclusion of TRAINER_OWNED_RE names) to see what's actually in the dataset.
    const nameLower = name.toLowerCase();
    const trainerOwnedRaw: unknown[] = [];
    for (const idx of vgxData.indexes) {
      for (const [key, cards] of idx) {
        if (/['’]\s*s\s+/i.test(key) && key.includes(nameLower)) {
          for (const c of cards) {
            trainerOwnedRaw.push({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity, artist: c.artist });
          }
        }
      }
    }

    out[name] = {
      irCandidates: irCands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
      irResult,
      vgxCandidates: vgxCands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist })),
      vgxResult,
      promoUrl,
      trainerPromoUrl,
      trainerOwnedRaw,
    };
  }

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
