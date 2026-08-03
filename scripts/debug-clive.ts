#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent('name:"Clive*"')}&pageSize=250&select=id,name,rarity,set,images,tcgplayer`;
  const res = await fetch(url, { headers: getHeaders() });
  const json = await res.json();
  const cards = (json.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    rarity: c.rarity,
    set: c.set?.id,
    setName: c.set?.name,
    image: c.images?.large,
  }));
  writeFileSync(join(import.meta.dirname, "../lib/debug-clive.json"), JSON.stringify(cards, null, 2));
  console.log(JSON.stringify(cards, null, 2));
  console.log("done");
}

main();
