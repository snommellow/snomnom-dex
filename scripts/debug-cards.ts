#!/usr/bin/env tsx
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function downloadImage(url: string, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buf);
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function main() {
  const imgDir = join(import.meta.dirname, "../lib/debug-images");
  if (!existsSync(imgDir)) mkdirSync(imgDir, { recursive: true });
  const targets = [
    ["articuno", "https://images.pokemontcg.io/sv9/161_hires.png"],
    ["zapdos", "https://images.pokemontcg.io/sv3pt5/202_hires.png"],
    ["flaaffy", "https://images.pokemontcg.io/swsh12tg/TG03_hires.png"],
    ["moltres", "https://assets.tcgdex.net/en/tcgp/A1/274/high.webp"],
  ] as const;
  for (const [name, url] of targets) {
    await downloadImage(url, join(imgDir, `${name}.png`));
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({ done: true }));
  console.log("done");
}

main();
