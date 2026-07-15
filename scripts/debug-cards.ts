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
    ["galarian-articuno-swsh6-170", "https://images.pokemontcg.io/swsh6/170_hires.png"],
    ["galarian-zapdos-swsh6-174", "https://images.pokemontcg.io/swsh6/174_hires.png"],
    ["galarian-moltres-swsh6-177", "https://images.pokemontcg.io/swsh6/177_hires.png"],
    ["galarian-articuno-tg16", "https://images.pokemontcg.io/swsh10tg/TG16_hires.png"],
    ["galarian-zapdos-tg19", "https://images.pokemontcg.io/swsh10tg/TG19_hires.png"],
    ["galarian-moltres-tg20", "https://images.pokemontcg.io/swsh10tg/TG20_hires.png"],
  ] as const;
  for (const [name, url] of targets) {
    await downloadImage(url, join(imgDir, `${name}.png`));
  }
  writeFileSync(join(import.meta.dirname, "../lib/debug-cards.json"), JSON.stringify({ done: true }));
  console.log("done");
}

main();
