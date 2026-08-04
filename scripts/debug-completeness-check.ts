#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

async function fetchCategoryMembers(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cmcontinue: string | undefined;
  do {
    const url = new URL(BULBAPEDIA_API);
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "categorymembers");
    url.searchParams.set("cmtitle", `Category:${category}`);
    url.searchParams.set("cmlimit", "500");
    url.searchParams.set("format", "json");
    if (cmcontinue) url.searchParams.set("cmcontinue", cmcontinue);
    const res = await fetch(url.toString());
    const json = await res.json();
    const members = json?.query?.categorymembers ?? [];
    for (const m of members) titles.push(m.title);
    cmcontinue = json?.continue?.cmcontinue;
  } while (cmcontinue);
  return titles;
}

async function main() {
  const results: Record<string, string[]> = {};
  for (const cat of [
    "Trainer classes",
    "Gym Leaders",
    "Elite Four",
    "Champions",
    "Rivals",
    "Pokémon Professors",
    "Team Rocket",
    "Team Aqua",
    "Team Magma",
    "Team Galactic",
    "Team Plasma",
    "Team Flare",
    "Team Skull",
    "Aether Foundation",
    "Team Yell",
    "Macro Cosmos",
    "Team Star",
    "Red characters",
    "Blue and Green characters",
    "Gold, Silver, and Crystal characters",
    "Ruby and Sapphire characters",
    "Emerald characters",
    "FireRed and LeafGreen characters",
    "Diamond and Pearl characters",
    "Platinum characters",
    "HeartGold and SoulSilver characters",
    "Black and White characters",
    "Black 2 and White 2 characters",
    "X and Y characters",
    "Omega Ruby and Alpha Sapphire characters",
    "Sun and Moon characters",
    "Ultra Sun and Ultra Moon characters",
    "Sword and Shield characters",
    "Brilliant Diamond and Shining Pearl characters",
    "Legends: Arceus characters",
    "Scarlet and Violet characters",
    "Legends: Z-A characters",
  ]) {
    console.log(`Fetching Category:${cat}...`);
    try {
      results[cat] = await fetchCategoryMembers(cat);
    } catch (e) {
      results[cat] = [`ERROR: ${e}`];
    }
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-completeness-check.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
