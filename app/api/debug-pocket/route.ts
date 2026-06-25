import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=name:"Charizard" set.id:a1&pageSize=20&select=id,name,rarity,set,images`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: `API ${res.status}` });
    const data = await res.json();
    const cards = (data.data ?? []).map((c: { id: string; name: string; rarity: string; set: { id: string; name: string } }) => ({
      id: c.id,
      name: c.name,
      rarity: c.rarity,
      set: c.set.id,
      setName: c.set.name,
    }));
    return NextResponse.json({ count: cards.length, cards });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
