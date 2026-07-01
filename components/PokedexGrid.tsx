import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgPromoSv, fetchTcgTrainerOwnedIrSir, fetchTcgVgx, fetchFormCard, fetchFormCardLastResort, fetchCardById, fetchTcgFallbackArt, fetchTcgLastResort, IR_RARITIES, VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";


// Pokémon with TCG mega cards that have no official game mega form in PokéAPI.
// Keyed by dex ID → display name used for TCGdex lookup.
const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
};

// Hardcoded pokemontcg.io card IDs for alt forms where automated lookup can't distinguish variants.
// Used when the API card name doesn't encode the X/Y variant (e.g. both M Mewtwo-EX cards are
// named identically — only the card number distinguishes them).
const HARDCODED_FORM_CARD_IDS: Record<string, string> = {
  // XY8 BREAKthrough: 63/162 = Psycho Cut (X form), 64/162 = Psychic Infinity (Y form)
  "Mega Mewtwo X": "xy8-63",
};

export default async function PokedexGrid() {
  const raw = await fetchFirst151();

  // Start Pocket fetches immediately — they only need names, not chain/species data.
  // This lets Phase B run in parallel with species fetches + Phase A.
  const pocketPromise = fetchPocketImages(raw.map((p) => ({ id: p.id, name: p.name })));

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

  // Phase B: Pocket images — resolve the promise started before Phase A.
  // Filter to only Pokémon without an IR/SIR or promo card.
  const allPocketResults = await pocketPromise;
  const pocketMap = new Map<number, string>();
  raw.forEach((p, j) => {
    if (allPocketResults[j]?.url && !irMap.has(p.id) && !promoSvMap.has(p.id)) {
      pocketMap.set(p.id, allPocketResults[j].url!);
    }
  });

  // Phase C: last-resort pass for Pokémon with no background card from any prior pass.
  // Run in parallel with alt form fetches.
  const noCardPokemon = raw.filter((p) => {
    const pocketUrl = pocketMap.get(p.id);
    return !irMap.has(p.id) && !promoSvMap.has(p.id) && !pocketUrl &&
      !trainerIrMap.has(p.id) && !vgxMap.has(p.id) && !fallbackArtMap.has(p.id);
  });

  // Fetch TCG cards for each alt form — run all three passes in parallel per form, then pick by priority.
  const [lastResortMap, altFormsWithCards] = await Promise.all([
    fetchTcgLastResort(noCardPokemon),
    Promise.all(
      altFormsData.map((forms, i) =>
        Promise.all(
          forms.map(async (form) => {
            const hardcodedCardId = HARDCODED_FORM_CARD_IDS[form.displayName];
            const [irUrl, pocket, vgxUrl, hardcodedUrl] = await Promise.all([
              fetchFormCard(form.category, raw[i].id, form.displayName, form.types, IR_RARITIES),
              fetchPocketAltForm(form.displayName, form.category),
              fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES),
              hardcodedCardId ? fetchCardById(hardcodedCardId) : Promise.resolve(null),
            ]);
            const tcgUrl = hardcodedUrl ?? irUrl ?? (pocket.url || null) ?? vgxUrl ?? null;
            const regularCardUrl = !tcgUrl && form.category !== "other"
              ? await fetchFormCardLastResort(form.displayName)
              : null;
            return { ...form, tcgUrl, regularCardUrl };
          })
        )
      )
    ),
  ]);

  const pokemon = raw.map((p, i) => {
    const pocketUrl = pocketMap.get(p.id);
    // Pocket beats trainerIr and VGX — only use those if no pocket card
    const tcgResult = irMap.get(p.id) ?? promoSvMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? { tcgUrl: null };
    const fallbackCrop = fallbackArtMap.get(p.id) ?? lastResortMap.get(p.id)?.tcgUrl ?? undefined;
    return toPokemonSummary(
      p,
      tcgResult,
      pocketUrl ? [pocketUrl] : [],
      speciesData[i].genus,
      altFormsWithCards[i],
      fallbackCrop,
    );
  });

  return <PokedexClient pokemon={pokemon} />;
}
