#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { buildVgxData, vgxCandidates, vgxPick } from "../lib/tcgapi";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const out: Record<string, unknown> = {};

  // Direct lookup of the card itself
  const res = await fetch(`${PTCGIO_BASE}/cards/swsh10tg-TG13`, { headers: getHeaders() });
  out.tg13Card = await res.json();

  // Full vgx pipeline for Starmie
  const vgxData = await buildVgxData();
  out.vgxRarities = vgxData.rarities;
  const cands = vgxCandidates(vgxData, "Starmie");
  out.starmieVgxCandidates = cands.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity }));
  out.starmieVgxResult = vgxPick(cands, undefined);

  // Is TG13 present in the raw "Trainer Gallery Rare Holo" index at all?
  const tgIndexRes = await fetch(`${PTCGIO_BASE}/cards?q=${encodeURIComponent('rarity:"Trainer Gallery Rare Holo" -subtypes:Tera')}&pageSize=250&page=1`, { headers: getHeaders() });
  const tgIndexJson = await tgIndexRes.json();
  const tgCards = (tgIndexJson.data ?? []) as any[];
  out.tgFirstPageCount = tgCards.length;
  out.tgTotalCount = tgIndexJson.totalCount;
  out.starmieInFirstPage = tgCards.some(c => c.id === "swsh10tg-TG13");

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
