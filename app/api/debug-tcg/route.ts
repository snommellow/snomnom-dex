export const dynamic = "force-dynamic";

const BASE = "https://api.pokemontcg.io/v2/cards";

async function tryUrl(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    return { url, status: res.status, count: json?.data?.length, sample: json?.data?.slice(0,3) };
  } catch (e) {
    return { url, status: 0, error: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    tryUrl(`${BASE}?q=nationalPokedexNumbers:15 (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare")&select=id,name,rarity,images,set`),
    tryUrl(`${BASE}?q=nationalPokedexNumbers:6 (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare")&select=id,name,rarity,subtypes,images,set`),
    tryUrl(`${BASE}?q=nationalPokedexNumbers:52 (rarity:"Illustration Rare" OR rarity:"Special Illustration Rare")&select=id,name,rarity,subtypes,images,set`),
  ]);
  return Response.json(results);
}
