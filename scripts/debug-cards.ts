#!/usr/bin/env tsx
import { writeFileSync } from "fs";

async function speciesVarieties(id: number) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  const data = await res.json();
  return (data.varieties as any[]).map(v => ({ name: v.pokemon.name, isDefault: v.is_default }));
}

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}
async function fetchAll(q: string) {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,set,images`;
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
  const targets = [
    { id: 26, name: "Raichu" },
    { id: 71, name: "Victreebel" },
    { id: 308, name: "Medicham" },
    { id: 354, name: "Banette" },
    { id: 358, name: "Chimecho" },
  ];
  for (const t of targets) {
    const varieties = await speciesVarieties(t.id);
    const namesToTry = [
      `${t.name} ex`, `M ${t.name}-EX`, `Mega ${t.name} ex`, `Mega ${t.name}`,
      `Mega ${t.name} X`, `Mega ${t.name} Y`,
    ];
    const results: Record<string, unknown> = {};
    for (const n of namesToTry) {
      const cards = await fetchAll(`name:"${n}"`);
      if (cards.length) results[n] = cards.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity }));
    }
    const subtypeCards = await fetchAll(`name:${t.name} subtypes:MEGA`);
    out[t.name] = { varieties, exactNameMatches: results, subtypeMegaCards: subtypeCards.map(c => ({ id: c.id, name: c.name, set: c.set.id, number: c.number, rarity: c.rarity })) };
  }
  writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
  console.log("wrote lib/debug-cards.json");
}

main();
