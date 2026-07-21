#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

async function main() {
  const res = await fetch("https://api.github.com/repos/PokeAPI/sprites/git/trees/master?recursive=1");
  const json = await res.json();
  const tree = json.tree as { path: string; type: string }[];
  const trainerFiles = tree.filter(t => t.path.includes("trainers") && t.type === "blob").map(t => t.path);
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({
    total: trainerFiles.length,
    sample: trainerFiles.slice(0, 80),
    truncated: json.truncated,
  }, null, 2));
  console.log("done");
}

main();
