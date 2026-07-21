#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const res = await fetch("https://pokeapi.co/api/v2/pokedex/?limit=100");
  const json = await res.json();
  const list = json.results as { name: string; url: string }[];
  const out: any[] = [];
  for (const { name, url } of list) {
    const r = await fetch(url);
    const d = await r.json();
    out.push({
      name: d.name,
      region: d.region?.name ?? null,
      is_main_series: d.is_main_series,
      descriptions: (d.descriptions as any[])?.find((x) => x.language.name === "en")?.description ?? null,
      count: (d.pokemon_entries as any[])?.length ?? 0,
    });
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(out, null, 2));
  console.log("done");
}

main();
