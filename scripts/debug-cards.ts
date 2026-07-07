import { writeFileSync } from "fs";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
function authHeaders() {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

async function fetchCards(name: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
      const res = await fetch(`${PTCGIO_BASE}/cards?q=name:${name}&pageSize=250`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return (data.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        set: c.set?.name,
        number: c.number,
        rarity: c.rarity,
        tcgplayer: c.tcgplayer?.prices,
        images: c.images,
      }));
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  return [];
}

async function main() {
  const overqwil = await fetchCards("Overqwil");
  const enamorus = await fetchCards("Enamorus");
  writeFileSync("lib/debug-cards.json", JSON.stringify({ overqwil, enamorus }, null, 2));
  console.log(`Wrote ${overqwil.length} Overqwil, ${enamorus.length} Enamorus cards`);
}

main();
