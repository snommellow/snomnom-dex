#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import {
  buildVgxData, vgxCandidates,
  fetchRegionalPromoPriority,
} from "../lib/tcgapi";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}
async function fetchAll(q: string) {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,artist,abilities,attacks,set,images,tcgplayer`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data ?? [];
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

async function main() {
  const out: Record<string, unknown> = {};

  // Mewtwo: check svp/52 raw card data (ability/attack fields) to see why promoSvPick excludes it.
  const mewtwoSvp = (await fetchAll(`set.id:svp name:"Mewtwo"`)).map(c => ({
    id: c.id, name: c.name, number: c.number, rarity: c.rarity,
    abilities: c.abilities, attacks: (c.attacks ?? []).map((a: any) => a.name),
  }));
  out.mewtwoSvp = mewtwoSvp;

  // Alolan Golem-GX: dump every candidate from the regional VGX path with full tiebreak fields.
  const vgxData = await buildVgxData();
  const golemCands = vgxCandidates(vgxData, "Alolan Golem");
  out.golemVgxCandidates = golemCands.map(c => ({
    id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c._rarity, artist: c.artist,
    price: (c as any).tcgplayer?.prices,
  }));
  const golemAll = await fetchAll(`name:"Alolan Golem"`);
  out.golemAllCards = golemAll.map(c => ({
    id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity,
    tcgplayer: c.tcgplayer,
  }));
  out.golemPromoPriority = await fetchRegionalPromoPriority("Alolan Golem");

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
