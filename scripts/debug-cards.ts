import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getCard(id: string) {
  try {
    const res = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`, { headers });
    if (!res.ok) return { id, error: res.status };
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes, abilities: c.abilities?.map((a: any) => a.name) };
  } catch (e) { return { id, error: String(e) }; }
}

async function search(name: string, setId: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}" set.id:${setId}`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, setName: c.set?.name, number: c.number, rarity: c.rarity, subtypes: c.subtypes }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["victini-blackbolt"] = await search("Victini", "zsv10pt5");
  out["victini-whiteflare"] = await search("Victini", "rsv10pt5");
  out["gothitelle-blackbolt"] = await search("Gothitelle", "zsv10pt5");
  out["gothitelle-whiteflare"] = await search("Gothitelle", "rsv10pt5");
  out["thundurus-blackbolt"] = await search("Thundurus", "zsv10pt5");
  out["thundurus-whiteflare"] = await search("Thundurus", "rsv10pt5");
  out["tornadus-blackbolt"] = await search("Tornadus", "zsv10pt5");
  out["tornadus-whiteflare"] = await search("Tornadus", "rsv10pt5");
  out["direct-208"] = await getCard("zsv10pt5-208");
  out["direct-209"] = await getCard("rsv10pt5-209");
  out["direct-210"] = await getCard("rsv10pt5-210");
  out["direct-211"] = await getCard("zsv10pt5-211");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
