#!/usr/bin/env tsx
import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchAll(q: string) {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,artist,abilities,attacks,flavorText,set,images,tcgplayer`;
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
  const deoxysAll = await fetchAll(`name:"Deoxys" -subtypes:Tera`);
  const gg12 = deoxysAll.find(c => c.id === "swsh12pt5gg-GG12");
  // "ex9" is EX Deoxys — the classic set with one card per forme.
  const ex9 = deoxysAll.filter(c => c.set.id === "ex9");

  const out = {
    gg12,
    ex9Cards: ex9.map(c => ({
      id: c.id, name: c.name, number: c.number, rarity: c.rarity,
      attacks: c.attacks, abilities: c.abilities, flavorText: c.flavorText, artist: c.artist,
      images: c.images,
    })),
    allDeoxysCount: deoxysAll.length,
  };

  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
