import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Search for Cubone across ALL sets to find what rarity/setId Pocket uses
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=name:"Cubone"&pageSize=50&select=id,name,rarity,set`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: `API ${res.status}` });
    const data = await res.json();
    type Card = { id: string; name: string; rarity: string; set: { id: string; name: string; series: string } };
    const cards = (data.data ?? []).map((c: Card) => ({
      id: c.id,
      name: c.name,
      rarity: c.rarity,
      setId: c.set.id,
      setName: c.set.name,
      series: c.set.series,
    }));
    return NextResponse.json({ count: cards.length, cards });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
