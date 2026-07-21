#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const res = await fetch("https://pokeapi.co/api/v2/");
  const json = await res.json();
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(json, null, 2));
  console.log("done");
}

main();
