import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function authHeaders() {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function main() {
  const speciesRes = await fetch("https://pokeapi.co/api/v2/pokemon-species/1024");
  const species = await speciesRes.json();

  const res = await fetch(`${PTCGIO_BASE}/cards?q=name:Terapagos&pageSize=250`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  const cards = (data.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    set: c.set?.name,
    number: c.number,
    rarity: c.rarity,
    tcgplayer: c.tcgplayer?.prices,
    images: c.images,
  }));
  writeFileSync("lib/debug-cards.json", JSON.stringify({ varieties: species.varieties, cards }, null, 2));
  console.log(`Wrote ${species.varieties.length} varieties, ${cards.length} cards`);
}

main();
