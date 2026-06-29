import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgPromoSv, fetchTcgTrainerOwnedIrSir, fetchTcgVgx, fetchFormCard, fetchTcgFallbackArt, IR_RARITIES, VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";


// Pokémon with TCG mega cards that have no official game mega form in PokéAPI.
// Keyed by dex ID → display name used for TCGdex lookup.
const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
};

export default async function PokedexGrid() {
  const raw = await fetchFirst151();

  // Species data: genus + alt form slots + evolution chain URL (single fetch per Pokémon)
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

  // Fetch each unique evolution chain once, then build dex ID → chain members map
  const uniqueChainUrls = [...new Set(speciesData.map(s => s.evolutionChainUrl).filter(Boolean) as string[])];
  const chainResults = await Promise.all(uniqueChainUrls.map(url => fetchEvolutionChainIds(url)));
  const urlToIds = new Map(uniqueChainUrls.map((url, i) => [url, chainResults[i]]));

  const chainsByDex = new Map<number, number[]>();
  speciesData.forEach((s, i) => {
    if (s.evolutionChainUrl) {
      const ids = urlToIds.get(s.evolutionChainUrl) ?? [];
      if (ids.length > 1) chainsByDex.set(raw[i].id, ids);
    }
  });

  // Phase A: run all bulk TCG passes + alt form data in parallel.
  // All bulk passes fetch full rarity indexes regardless of Pokémon list size,
  // so parallelizing them costs no extra API calls.
  const [irMap, promoSvMap, trainerIrMap, vgxMap, fallbackArtMap, altFormsData] = await Promise.all([
    fetchTcgIrSir(raw, chainsByDex),
    fetchTcgPromoSv(raw),
    fetchTcgTrainerOwnedIrSir(raw),
    fetchTcgVgx(raw, chainsByDex),
    fetchTcgFallbackArt(raw),
    Promise.all(
      raw.map((p, i) =>
        fetchAltForms(p.name, speciesData[i].altFormSlots).then((forms) => {
          const filtered = forms.filter((f) => f.category !== "mega" || f.artworkUrl !== null);
          const tcgOnly = TCG_ONLY_MEGAS[p.id];
          if (tcgOnly && !filtered.some((f) => f.category === "mega")) {
            filtered.push({
              slug: `${p.name}-mega`,
              displayName: tcgOnly.displayName,
              types: tcgOnly.types,
              artworkUrl: null,
              category: "mega",
              tcgUrl: null,
            } satisfies AltForm);
          }
          return filtered;
        })
      )
    ),
  ]);

  // Phase B: Pocket images — per-Pokémon calls, so filter to only those without a card yet.
  const needsPocket = raw.filter((p) => !irMap.has(p.id) && !promoSvMap.has(p.id));
  const pocketResultsList = needsPocket.length
    ? await fetchPocketImages(needsPocket.map((p) => ({ id: p.id, name: p.name })))
    : [];
  const pocketMap = new Map<number, string>();
  needsPocket.forEach((p, j) => {
    if (pocketResultsList[j]?.url) pocketMap.set(p.id, pocketResultsList[j].url!);
  });

  // Fetch TCG cards for each alt form — run all three passes in parallel per form, then pick by priority.
  const altFormsWithCards = await Promise.all(
    altFormsData.map((forms, i) =>
      Promise.all(
        forms.map(async (form) => {
          const [irUrl, pocket, vgxUrl] = await Promise.all([
            fetchFormCard(form.category, raw[i].id, form.displayName, form.types, IR_RARITIES),
            fetchPocketAltForm(form.displayName, form.category),
            fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES),
          ]);
          const tcgUrl = irUrl ?? (pocket.url || null) ?? vgxUrl ?? null;
          return { ...form, tcgUrl };
        })
      )
    )
  );

  const pokemon = raw.map((p, i) => {
    const pocketUrl = pocketMap.get(p.id);
    // Pocket beats trainerIr and VGX — only use those if no pocket card
    const tcgResult = irMap.get(p.id) ?? promoSvMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? { tcgUrl: null };
    if (p.id === 76 || p.id === 89) {
      console.log(`[DEBUG] #${p.id} ${p.name}:`, { ir: irMap.get(p.id)?.tcgUrl ?? null, promo: promoSvMap.get(p.id)?.tcgUrl ?? null, pocket: pocketUrl ?? null, trainerIr: trainerIrMap.get(p.id)?.tcgUrl ?? null, vgx: vgxMap.get(p.id) ?? null, fallback: fallbackArtMap.get(p.id) ?? null, tcgResult });
    }
    return toPokemonSummary(
      p,
      tcgResult,
      pocketUrl ? [pocketUrl] : [],
      speciesData[i].genus,
      altFormsWithCards[i],
      fallbackArtMap.get(p.id),
    );
  });

  return <PokedexClient pokemon={pokemon} />;
}
