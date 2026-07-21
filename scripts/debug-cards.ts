#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";

async function check(path: string): Promise<[string, number]> {
  const res = await fetch(`https://raw.githubusercontent.com/PokeAPI/sprites/master/${path}`, { method: "HEAD" });
  return [path, res.status];
}

async function main() {
  const candidates = [
    "sprites/trainers/red.png",
    "sprites/trainers/blue.png",
    "sprites/trainers/youngster.png",
    "sprites/pokemon/trainer/red.png",
    "sprites/pokemon/versions/generation-i/red-blue/back/1.png",
    "sprites/trainers/1/1.png",
    "sprites/battlers/red.png",
    "sprites/trainers-battlers/red.png",
    "sprites/sugimori/trainer.png",
    "sprites/trainers/gym-leader/brock.png",
  ];
  const results = await Promise.all(candidates.map(check));
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify(results, null, 2));
  console.log("done");
}

main();
