#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

async function fetchCategories(title: string): Promise<{ found: boolean; categories: string[] }> {
  const url = `${BULBAPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=categories&cllimit=100&format=json&redirects=1`;
  const res = await fetch(url);
  const json = await res.json();
  const page = Object.values(json?.query?.pages ?? {})[0] as { missing?: unknown; categories?: { title: string }[] } | undefined;
  if (!page || page.missing !== undefined) return { found: false, categories: [] };
  return { found: true, categories: (page.categories ?? []).map((c) => c.title) };
}

async function main() {
  const candidates = [
    "Aether Foundation (Trainer class)",
    "Aqua Admin (Trainer class)",
    "Magma Admin (Trainer class)",
    "Team Star (Trainer class)",
    "Team Snagem (Trainer class)",
    "Rust Syndicate (Trainer class)",
    "Team Captain (Trainer class)",
    "Clan Leader (Trainer class)",
    "Ultra Recon Squad (Trainer class)",
    "Subway Boss (Trainer class)",
  ];
  const results: Record<string, { found: boolean; categories: string[] }> = {};
  for (const c of candidates) {
    console.log(`Checking ${c}...`);
    results[c] = await fetchCategories(c);
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-class-region-check.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
