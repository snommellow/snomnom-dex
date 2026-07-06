import { writeFileSync, mkdirSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function authHeaders() {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const res = await fetch(`${PTCGIO_BASE}/cards?q=name:Zygarde&pageSize=250`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  const cards = (data.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    set: c.set?.name,
    setId: c.set?.id,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes,
    supertype: c.supertype,
    tcgplayer: c.tcgplayer?.prices,
    images: c.images,
  }));
  writeFileSync("lib/debug-cards.json", JSON.stringify(cards, null, 2));
  console.log(`Wrote ${cards.length} cards`);

  mkdirSync("lib/debug-images", { recursive: true });
  for (const c of cards) {
    const url = c.images?.large || c.images?.small;
    if (!url) continue;
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(`lib/debug-images/${c.id}.png`, buf);
    console.log(`Wrote image ${c.id} (${buf.length} bytes)`);
  }
}

main();
