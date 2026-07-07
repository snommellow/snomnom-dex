import { writeFileSync, mkdirSync } from "fs";

async function main() {
  mkdirSync("lib/debug-images", { recursive: true });
  const urls: Record<string, string> = {
    "sv1-157": "https://images.pokemontcg.io/sv1/157_hires.png",
    "sv3-184": "https://images.pokemontcg.io/sv3/184_hires.png",
    "sv3-183": "https://images.pokemontcg.io/sv3/183_hires.png",
    "sv9-140": "https://images.pokemontcg.io/sv9/140_hires.png",
  };
  for (const [id, url] of Object.entries(urls)) {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`lib/debug-images/${id}.png`, buf);
    console.log(`Wrote ${id} (${buf.length} bytes)`);
  }
}

main();
