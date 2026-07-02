#!/usr/bin/env tsx
// Generates lib/pokemon-data.json — run with: npm run generate
// Optional: set POKEMONTCG_API_KEY env var to avoid rate limits.

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm, type PokemonSummary } from "../lib/pokeapi";
import {
  buildIrSirData, irSirCandidates, irSirPick, trainerIrPick,
  buildPromoSvData, promoSvPick,
  buildVgxData, vgxCandidates, vgxPick,
  buildAncientTraitData, ancientTraitPick,
  buildFallbackArtData, fallbackArtPick,
  fetchFormCard, fetchFormCardLastResort, fetchCardById,
  fetchTcgLastResort, toDisplayName,
  IR_RARITIES, VGX_RARITIES,
} from "../lib/tcgapi";
import { buildChainSets } from "../lib/chains";
import { fetchPocketImages, fetchPocketAltForm, fetchPocketFallback } from "../lib/pocketapi";

const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
};

const HARDCODED_FORM_CARD_IDS: Record<string, string> = {
  "Mega Mewtwo X": "xy8-63",
  // SWSH294 has "Promo" rarity — not in VGX_RARITIES, so the normal V-card lookup only
  // finds swsh11-172 (Lost Origin). Hardcode to target the Black Star Promo directly.
  "Hisuian Electrode": "swshp-SWSH294",
  // SM236 is a full-art promo ("Promo" rarity) — not in VGX_RARITIES, so automated lookup
  // picks sm5/29 (Guardians Rising bordered holo) instead.
  "Alolan Sandslash": "smp-SM236",
};

async function main() {
  console.log("Fetching Pokémon list...");
  const raw = await fetchFirst151();

  const pocketPromise = fetchPocketImages(raw.map((p) => ({ id: p.id, name: p.name, gameTypes: p.types.map(t => t.type.name) })));

  console.log("Fetching species data...");
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

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

  console.log("Fetching TCG indexes + alt forms...");
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

  const irCandidatesList = raw.map(p => irSirCandidates(irData, toDisplayName(p.name)));
  const irSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(irCandidatesList[i].map(c => c.set.id))]));
  const irChainSetsMap = buildChainSets(irSetsByDex, chainsByDex);

  const vgxCandidatesList = raw.map(p => vgxCandidates(vgxData, toDisplayName(p.name)));
  const vgxSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(vgxCandidatesList[i].map(c => c.set.id))]));
  const vgxChainSetsMap = buildChainSets(vgxSetsByDex, chainsByDex);

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

  console.log("Fetching Pocket images...");
  const allPocketResults = await pocketPromise;
  const pocketMap = new Map<number, string>();
  raw.forEach((p, j) => {
    if (allPocketResults[j]?.url && !irMap.has(p.id) && !promoSvMap.has(p.id)) {
      pocketMap.set(p.id, allPocketResults[j].url!);
    }
  });

  const noCardPokemon = raw.filter((p) => {
    const pocketUrl = pocketMap.get(p.id);
    return !irMap.has(p.id) && !promoSvMap.has(p.id) && !pocketUrl &&
      !trainerIrMap.has(p.id) && !vgxMap.has(p.id);
  });

  // Run fetchTcgLastResort before alt-form queries to avoid competing with them for rate limits.
  console.log(`Fetching last-resort cards for ${noCardPokemon.length} Pokémon...`);
  const lastResortTcgMap = await fetchTcgLastResort(noCardPokemon);

  console.log("Fetching alt form cards...");
  const [pocketFallbackResults, altFormsWithCards] = await Promise.all([
    fetchPocketFallback(noCardPokemon),
    Promise.all(
      altFormsData.map((forms, i) =>
        Promise.all(
          forms.map(async (form) => {
            const hardcodedCardId = HARDCODED_FORM_CARD_IDS[form.displayName];
            const irFromIndex = irSirPick(irSirCandidates(irData, form.displayName));
            const promoUrl = await promoSvPick(promoData, form.displayName);
            const trainerIrUrl = trainerIrPick(irData, form.displayName);
            const vgxFromIndex = vgxPick(vgxCandidates(vgxData, form.displayName));
            const ancientTraitUrl = ancientTraitPick(ancientTraitData, form.displayName);
            const fallbackUrl = fallbackArtPick(fallbackData, form.displayName);

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
      pocketFallbackMap.set(p.id, pocketFallbackResults[i].url!);
    }
  });

  const pokemon = raw.map((p, i) => {
    const pocketUrl = pocketMap.get(p.id) ?? pocketFallbackMap.get(p.id);
    const ancientTraitUrl = ancientTraitMap.get(p.id);
    const tcgResult = irMap.get(p.id) ?? promoSvMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? (!pocketUrl && ancientTraitUrl ? { tcgUrl: ancientTraitUrl, isOldStyle: true } : undefined) ?? { tcgUrl: null };
    const fallbackCrop = fallbackArtMap.get(p.id) ?? lastResortMap.get(p.id)?.tcgUrl ?? undefined;
    return toPokemonSummary(p, tcgResult, pocketUrl ? [pocketUrl] : [], speciesData[i].genus, altFormsWithCards[i], fallbackCrop);
  });

  // Preserve regularCardUrl from previous run when the new run returned null
  // (guards against transient API failures wiping out previously-found fallback cards).
  const outPath = join(import.meta.dirname, "../lib/pokemon-data.json");
  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, "utf-8")) as PokemonSummary[];
    const prevById = new Map(prev.map(p => [p.id, p]));
    for (const p of pokemon) {
      if (!p.regularCardUrl && !p.bgCandidates.length) {
        const old = prevById.get(p.id);
        if (old?.regularCardUrl && !/\/(base|gym|neo)\d\//i.test(old.regularCardUrl)) p.regularCardUrl = old.regularCardUrl;
      }
    }
  }

  writeFileSync(outPath, JSON.stringify(pokemon, null, 2));
  console.log(`Written ${pokemon.length} Pokémon to lib/pokemon-data.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
