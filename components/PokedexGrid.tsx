import fs from "fs";
import path from "path";
import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm, type PokemonSummary } from "@/lib/pokeapi";
import {
  buildIrSirData, irSirCandidates, irSirPick, trainerIrPick,
  buildPromoSvData, promoSvPick,
  buildVgxData, vgxCandidates, vgxPick,
  buildAncientTraitData, ancientTraitPick,
  buildFallbackArtData, fallbackArtPick,
  fetchFormCard, fetchFormCardLastResort, fetchCardById,
  fetchTcgLastResort, toDisplayName,
  IR_RARITIES, VGX_RARITIES,
} from "@/lib/tcgapi";
import { buildChainSets } from "@/lib/chains";
import { fetchPocketImages, fetchPocketAltForm, fetchPocketFallback } from "@/lib/pocketapi";
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
  // SWSH294 has "Promo" rarity — not in VGX_RARITIES, so the normal V-card lookup only
  // finds swsh11-172 (Lost Origin). Hardcode to target the Black Star Promo directly.
  "Hisuian Electrode": "swshp-SWSH294",
  // SM236 is a full-art promo ("Promo" rarity) — not in VGX_RARITIES, so automated lookup
  // picks sm5/29 (Guardians Rising bordered holo) instead.
  "Alolan Sandslash": "smp-SM236",
};

export default async function PokedexGrid() {
  // Use pre-generated static data when available — run `npm run generate` to refresh.
  const staticPath = path.join(process.cwd(), "lib/pokemon-data.json");
  if (fs.existsSync(staticPath)) {
    const pokemon = JSON.parse(fs.readFileSync(staticPath, "utf-8")) as PokemonSummary[];
    return <PokedexClient pokemon={pokemon} />;
  }

  const raw = await fetchFirst151();

  // Start Pocket fetches immediately — they only need names, not chain/species data.
  const pocketPromise = fetchPocketImages(raw.map((p) => ({ id: p.id, name: p.name })));

  // Species data: genus + alt form slots + evolution chain URL
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

  // Build dex ID → evolution chain members map
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

  // Phase A: fetch all TCG indexes + alt form data in parallel.
  // All four builders fetch full rarity indexes regardless of Pokémon list size.
  const [irData, promoData, vgxData, ancientTraitData, fallbackData, altFormsData] = await Promise.all([
    buildIrSirData(),
    buildPromoSvData(),
    buildVgxData(),
    buildAncientTraitData(),
    buildFallbackArtData(),
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

  // Compute candidates + chain sets for IR and VGX passes (both need cross-Pokémon set coherence).
  const irCandidatesList = raw.map(p => irSirCandidates(irData, toDisplayName(p.name)));
  const irSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(irCandidatesList[i].map(c => c.set.id))]));
  const irChainSetsMap = buildChainSets(irSetsByDex, chainsByDex);

  const vgxCandidatesList = raw.map(p => vgxCandidates(vgxData, toDisplayName(p.name)));
  const vgxSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(vgxCandidatesList[i].map(c => c.set.id))]));
  const vgxChainSetsMap = buildChainSets(vgxSetsByDex, chainsByDex);

  // Build result maps for base Pokémon — all sync lookups using the shared indexes.
  const irMap = new Map(raw.flatMap((p, i) => {
    const r = irSirPick(irCandidatesList[i], irChainSetsMap.get(p.id));
    return r ? [[p.id, r]] : [];
  }));
  const promoSvEntries = await Promise.all(
    raw.map(async p => {
      const url = await promoSvPick(promoData, toDisplayName(p.name));
      return url ? [p.id, { tcgUrl: url }] as const : null;
    })
  );
  const promoSvMap = new Map(promoSvEntries.filter((e): e is NonNullable<typeof e> => e !== null));
  const trainerIrMap = new Map(raw.flatMap(p => {
    const url = trainerIrPick(irData, toDisplayName(p.name));
    return url ? [[p.id, { tcgUrl: url }]] : [];
  }));
  const vgxMap = new Map(raw.flatMap((p, i) => {
    const r = vgxPick(vgxCandidatesList[i], vgxChainSetsMap.get(p.id));
    return r ? [[p.id, r]] : [];
  }));
  const ancientTraitMap = new Map(raw.flatMap(p => {
    const url = ancientTraitPick(ancientTraitData, toDisplayName(p.name));
    return url ? [[p.id, url]] : [];
  }));
  const fallbackArtMap = new Map(raw.flatMap(p => {
    const url = fallbackArtPick(fallbackData, toDisplayName(p.name));
    return url ? [[p.id, url]] : [];
  }));

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
  const noCardPokemon = raw.filter((p) => {
    const pocketUrl = pocketMap.get(p.id);
    return !irMap.has(p.id) && !promoSvMap.has(p.id) && !pocketUrl &&
      !trainerIrMap.has(p.id) && !vgxMap.has(p.id) && !fallbackArtMap.has(p.id);
  });


  // Alt forms use the same shared indexes (sync lookups) plus fetchFormCard for mega-specific
  // per-name queries that the bulk indexes can't handle (e.g. "M Charizard-EX" ≠ "Mega Charizard X").
  const [lastResortTcgMap, pocketFallbackResults, altFormsWithCards] = await Promise.all([
    fetchTcgLastResort(noCardPokemon),
    fetchPocketFallback(noCardPokemon),
    Promise.all(
      altFormsData.map((forms, i) =>
        Promise.all(
          forms.map(async (form) => {
            const hardcodedCardId = HARDCODED_FORM_CARD_IDS[form.displayName];

            // Sync lookups from shared indexes (free — data already in memory)
            const irFromIndex = irSirPick(irSirCandidates(irData, form.displayName));
            const promoUrl = await promoSvPick(promoData, form.displayName);
            const trainerIrUrl = trainerIrPick(irData, form.displayName);
            const vgxFromIndex = vgxPick(vgxCandidates(vgxData, form.displayName));
            const ancientTraitUrl = ancientTraitPick(ancientTraitData, form.displayName);
            const fallbackUrl = fallbackArtPick(fallbackData, form.displayName);

            // Async: per-name queries needed for mega forms (bulk indexes key on card name, not form name)
            // and Pocket lookup. Run in parallel.
            const [irFromFormCard, pocket, vgxFromFormCard, hardcodedUrl] = await Promise.all([
              !irFromIndex ? fetchFormCard(form.category, raw[i].id, form.displayName, form.types, IR_RARITIES) : Promise.resolve(null),
              fetchPocketAltForm(form.displayName, form.category),
              !vgxFromIndex ? fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES) : Promise.resolve(null),
              hardcodedCardId ? fetchCardById(hardcodedCardId) : Promise.resolve(null),
            ]);

            const irUrl = irFromIndex?.tcgUrl ?? irFromFormCard;
            const vgxUrl = vgxFromIndex?.tcgUrl ?? vgxFromFormCard;

            const tcgUrl = hardcodedUrl ?? irUrl ?? promoUrl ?? (pocket.url || null) ?? trainerIrUrl ?? vgxUrl ?? ancientTraitUrl ?? null;
            const regularCardUrl = !tcgUrl && form.category !== "other"
              ? (fallbackUrl ?? await fetchFormCardLastResort(form.displayName))
              : null;
            return { ...form, tcgUrl, regularCardUrl };
          })
        )
      )
    ),
  ]);

  const lastResortMap = new Map(lastResortTcgMap);
  const pocketFallbackMap = new Map<number, string>();
  noCardPokemon.forEach((p, i) => {
    if (pocketFallbackResults[i]?.url) {
      if (!lastResortMap.has(p.id)) {
        pocketFallbackMap.set(p.id, pocketFallbackResults[i].url!);
      }
    }
  });

  const pokemon = raw.map((p, i) => {
    const pocketUrl = pocketMap.get(p.id) ?? pocketFallbackMap.get(p.id);
    const ancientTraitUrl = ancientTraitMap.get(p.id);
    const tcgResult = irMap.get(p.id) ?? promoSvMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? (!pocketUrl && ancientTraitUrl ? { tcgUrl: ancientTraitUrl } : undefined) ?? { tcgUrl: null };
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
