import { NextResponse } from "next/server";

// Probe PokéOS textless sets by checking if known cards exist at various set IDs
// We know set 384 = Pocket. Try nearby IDs and some guesses for SV/SWSH sets.
export async function GET() {
  const BASE = "https://s3.pokeos.com/pokeos-uploads/tcg/textless";

  // Charizard is card #4 in sv3pt5 (151) and appears in many sets.
  // Try card 1 at various set IDs to find which sets exist.
  const setIds = [
    // Around 384
    370, 371, 372, 373, 374, 375, 376, 377, 378, 379,
    380, 381, 382, 383, 384, 385, 386, 387, 388, 389, 390,
    // Some round numbers
    100, 150, 200, 250, 300, 350, 400,
    // SV era guesses
    360, 361, 362, 363, 364, 365, 366, 367, 368, 369,
  ];

  const results = await Promise.all(
    setIds.map(async (setId) => {
      // Check card 1 in each set
      const url = `${BASE}/${setId}/1.png`;
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        return { setId, card1: res.status };
      } catch {
        return { setId, card1: -1 };
      }
    })
  );

  const found = results.filter((r) => r.card1 === 200);
  return NextResponse.json({ found, all: results });
}
