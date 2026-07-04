#!/usr/bin/env tsx
// Temporary debug script — checks the Chinese-exclusive promo pipeline for Ponyta end to end.
import { writeFileSync } from "fs";
import { fetchSpeciesData } from "../lib/pokeapi";

async function fetchZhCards(name: string) {
  const url = `https://api.tcgdex.net/v2/zh-tw/cards?name=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) return { status: res.status, data: null };
  const json = await res.json();
  return { status: res.status, data: Array.isArray(json) ? json : (json?.data ?? json) };
}

async function main() {
  const species = await fetchSpeciesData(77); // Ponyta
  const zhResult = species.chineseName ? await fetchZhCards(species.chineseName) : null;
  writeFileSync("lib/debug-cards.json", JSON.stringify({ species, zhResult }, null, 2));
  console.log("Wrote lib/debug-cards.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
