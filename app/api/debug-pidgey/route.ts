import { NextResponse } from "next/server";

export async function GET() {
  // Find Pidgey's IR card in sv3pt5
  const res = await fetch(
    `https://api.pokemontcg.io/v2/cards?q=name:"Pidgey" set.id:sv3pt5&pageSize=20&select=id,name,number,rarity,set`,
    { cache: "no-store" }
  );
  const data = await res.json();

  // For each card found, check if PokéOS set 110 or 111 has it
  const cards = data.data ?? [];
  const checks = await Promise.all(
    cards.map(async (c: { id: string; name: string; number: string; rarity: string }) => {
      const n = c.number;
      const [r110, r111] = await Promise.all([
        fetch(`https://s3.pokeos.com/pokeos-uploads/tcg/textless/110/${n}.jpg`, { method: "HEAD", cache: "no-store" }),
        fetch(`https://s3.pokeos.com/pokeos-uploads/tcg/textless/111/${n}.jpg`, { method: "HEAD", cache: "no-store" }),
      ]);
      return { ...c, pokeos110: r110.status, pokeos111: r111.status };
    })
  );

  return NextResponse.json(checks);
}
