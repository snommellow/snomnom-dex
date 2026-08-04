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
