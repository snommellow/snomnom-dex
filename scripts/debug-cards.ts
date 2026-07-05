import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

function price(c: any): number {
  const tp = c.tcgplayer?.prices;
  if (tp) {
    const vals = Object.values(tp).map((v: any) => v?.market ?? 0).filter((n: number) => n > 0);
    if (vals.length) return Math.max(...vals);
  }
  const cm = c.cardmarket?.prices?.averageSellPrice;
  return cm ?? 0;
}

async function search(name: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
      if (!res.ok) { if (i === retries - 1) return { error: res.status }; continue; }
      const data = await res.json();
      return (data.data as any[])
        .map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, price: price(c) }))
        .sort((a, b) => b.price - a.price);
    } catch (e) { if (i === retries - 1) return { error: String(e) }; }
    await new Promise(r => setTimeout(r, 1500));
  }
}

async function getCard(id: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes };
  } catch (e) { return { id, error: String(e) }; }
}

async function tcgdexSearch(name: string) {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(name)}`);
    if (!res.ok) return { error: res.status };
    return await res.json();
  } catch (e) { return { error: String(e) }; }
}

async function main() {
  const out: Record<string, unknown> = {};
  out["landorus-all"] = await search("Landorus");
  out["gg56"] = await getCard("swsh12pt5-GG56");
  out["tcgdex-victini"] = await tcgdexSearch("Victini");
  out["tcgdex-gothitelle"] = await tcgdexSearch("Gothitelle");
  out["tcgdex-thundurus"] = await tcgdexSearch("Thundurus");
  out["tcgdex-tornadus"] = await tcgdexSearch("Tornadus");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
