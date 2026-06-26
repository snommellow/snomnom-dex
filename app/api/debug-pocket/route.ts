export const dynamic = "force-dynamic";

const BASE = "https://api.tcgdex.net/v2/en";

async function tryUrl(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 500); }
    return { url, status: res.status, body: json };
  } catch (e) {
    return { url, status: 0, error: String(e) };
  }
}

export async function GET() {
  const results = await Promise.all([
    tryUrl(`${BASE}/cards?dexId=15`),
    tryUrl(`${BASE}/cards?nationalPokedexNumber=15`),
    tryUrl(`${BASE}/cards?name=Beedrill`),
    tryUrl(`${BASE}/series/tcgp`),
  ]);
  return Response.json(results);
}
