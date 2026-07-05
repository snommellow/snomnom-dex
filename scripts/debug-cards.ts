import fs from "fs";

const API_KEY = process.env.POKEMONTCG_API_KEY;
const headers: Record<string, string> = API_KEY ? { "X-Api-Key": API_KEY } : {};

async function getSpecies(id: number) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
  if (!res.ok) return { id, error: res.status };
  const data = await res.json();
  return { id, varieties: (data.varieties as any[]).map(v => ({ is_default: v.is_default, name: v.pokemon.name })) };
}

async function search(name: string) {
  const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${name}"`)}&pageSize=250`, { headers });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return (data.data as any[]).map(c => ({ id: c.id, name: c.name, set: c.set?.id, number: c.number, rarity: c.rarity }));
}

async function main() {
  const out: Record<string, unknown> = {};
  out["hoopa-species"] = await getSpecies(720);
  out["zygarde-species"] = await getSpecies(718);
  out["aegislash-species"] = await getSpecies(681);
  out["pumpkaboo-species"] = await getSpecies(710);
  out["gourgeist-species"] = await getSpecies(711);
  out["hoopa-unbound-search"] = await search("Hoopa Unbound");
  out["hoopa-confined-search"] = await search("Hoopa Confined");
  out["hoopa-search"] = await search("Hoopa");
  out["aegislash-blade-search"] = await search("Aegislash");
  out["pumpkaboo-search"] = await search("Pumpkaboo");
  out["gourgeist-search"] = await search("Gourgeist");
  fs.writeFileSync("lib/debug-cards.json", JSON.stringify(out, null, 2));
}

main();
