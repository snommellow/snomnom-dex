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
  fetchFormCard, fetchFormCardLastResort,
  fetchTcgLastResort, toDisplayName,
  IR_RARITIES, VGX_RARITIES,
} from "../lib/tcgapi";
import { buildChainSets } from "../lib/chains";
import { fetchPocketImages, fetchPocketAltForm, fetchPocketFallback } from "../lib/pocketapi";

const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
};

// Direct background card URLs for base Pokémon where automated lookup fails or picks wrong card.
// Keyed by dex ID. These bypass tcgResult and go directly into bgCandidates.
// URL pattern: https://images.pokemontcg.io/{setId}/{cardNumber}_hires.png
const HARDCODED_BG_URLS: Record<number, string> = {
  // #022 Fearow: xy6-41 is θ Double Ancient Trait from Roaring Skies — AT lookup fails under rate limits.
  22: "https://images.pokemontcg.io/xy6/41_hires.png",
};

// Direct image URLs for forms where the automated lookup picks a wrong/inferior card.
// Using URLs directly avoids a per-card API call that can fail under rate limits.
// URL pattern: https://images.pokemontcg.io/{setId}/{cardNumber}_hires.png
const HARDCODED_FORM_URLS: Record<string, string> = {
  "Mega Mewtwo X":   "https://images.pokemontcg.io/xy8/63_hires.png",
  // SWSH294 is the Black Star Promo full-art; automated lookup picks swsh11-172 (bordered V).
  "Hisuian Electrode": "https://images.pokemontcg.io/swshp/SWSH294_hires.png",
  // SM236 is a full-art promo; automated lookup picks sm5/29 (bordered holo).
  "Alolan Sandslash": "https://images.pokemontcg.io/smp/SM236_hires.png",
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
            const hardcodedUrl = HARDCODED_FORM_URLS[form.displayName] ?? null;
            const irFromIndex = irSirPick(irSirCandidates(irData, form.displayName));
            const promoUrl = await promoSvPick(promoData, form.displayName);
            const trainerIrUrl = trainerIrPick(irData, form.displayName);
            const vgxFromIndex = vgxPick(vgxCandidates(vgxData, form.displayName));
            const ancientTraitUrl = ancientTraitPick(ancientTraitData, form.displayName);
            const fallbackUrl = fallbackArtPick(fallbackData, form.displayName);

            const [irFromFormCard, pocket, vgxFromFormCard] = await Promise.all([
              !irFromIndex ? fetchFormCard(form.category, raw[i].id, form.displayName, form.types, IR_RARITIES) : Promise.resolve(null),
              fetchPocketAltForm(form.displayName, form.category),
              !vgxFromIndex ? fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES) : Promise.resolve(null),
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
    const hardcodedBg = HARDCODED_BG_URLS[p.id];
    const tcgResult = hardcodedBg ? { tcgUrl: hardcodedBg } : (irMap.get(p.id) ?? promoSvMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? (!pocketUrl && ancientTraitUrl ? { tcgUrl: ancientTraitUrl } : undefined) ?? { tcgUrl: null });
    const fallbackCrop = !hardcodedBg ? (fallbackArtMap.get(p.id) ?? lastResortMap.get(p.id)?.tcgUrl ?? undefined) : undefined;
    return toPokemonSummary(p, tcgResult, pocketUrl ? [pocketUrl] : [], speciesData[i].genus, altFormsWithCards[i], fallbackCrop);
  });

  // Preserve cards from previous run when the new run returned null.
  // Guards against transient API failures (rate limits, timeouts) wiping out previously-found cards.
  const outPath = join(import.meta.dirname, "../lib/pokemon-data.json");
  if (existsSync(outPath)) {
    const prev = JSON.parse(readFileSync(outPath, "utf-8")) as PokemonSummary[];
    const prevById = new Map(prev.map(p => [p.id, p]));
    for (const p of pokemon) {
      const old = prevById.get(p.id);
      if (!old) continue;
      // Preserve base form fallback card
      if (!p.regularCardUrl && !p.bgCandidates.length) {
        if (old.regularCardUrl && !/\/(base|gym|neo)\d\//i.test(old.regularCardUrl)) p.regularCardUrl = old.regularCardUrl;
      }
      // Preserve alt form cards
      const oldFormBySlug = new Map((old.altForms ?? []).map(f => [f.slug, f]));
      for (const form of p.altForms ?? []) {
        if (form.tcgUrl || form.regularCardUrl) continue;
        const oldForm = oldFormBySlug.get(form.slug);
        if (oldForm?.tcgUrl) form.tcgUrl = oldForm.tcgUrl;
        else if (oldForm?.regularCardUrl) form.regularCardUrl = oldForm.regularCardUrl;
      }
    }
  }

  writeFileSync(outPath, JSON.stringify(pokemon, null, 2));
  console.log(`Written ${pokemon.length} Pokémon to lib/pokemon-data.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
