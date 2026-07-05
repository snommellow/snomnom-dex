#!/usr/bin/env tsx
// Generates lib/pokemon-data.json — run with: npm run generate
// Optional: set POKEMONTCG_API_KEY env var to avoid rate limits.

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm, type PokemonSummary } from "../lib/pokeapi";
import {
  buildIrSirData, irSirCandidates, irSirPick, trainerIrPick,
  buildPromoSvData, promoSvPick, trainerPromoPick,
  buildVgxData, vgxCandidates, vgxPick, trainerVgxPick,
  buildAncientTraitData, ancientTraitPick,
  buildFallbackArtData, fallbackArtPick,
  fetchFormCard, fetchFormCardLastResort, fetchRegionalPromoPriority,
  fetchTcgLastResort, toDisplayName,
  IR_RARITIES, VGX_RARITIES,
} from "../lib/tcgapi";
import { buildChainSets } from "../lib/chains";
import { fetchPocketImages, fetchPocketAltForm, fetchPocketFallback } from "../lib/pocketapi";

// Firing ~380+ concurrent promoSvPick calls (each doing its own imageExists HEAD request)
// was sustained enough to overwhelm pokemontcg.io's rate limit past our retry budget —
// isolated single-Pokémon calls always succeeded, but the full run consistently failed for
// specific Pokémon depending on request ordering. Batching keeps concurrency bounded instead.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
};

// Burmy's Sandy/Trash Cloak aren't separate PokeAPI species varieties (unlike Wormadam's, since
// Burmy's cloak is cosmetic-only until it evolves), so fetchAltForms never surfaces them even
// though real, distinctly-named TCG cards exist for both (see HARDCODED_FORM_REGULAR_URLS).
const BURMY_CLOAK_FORMS: Array<{ slug: string; displayName: string; types: string[] }> = [
  { slug: "burmy-sandy", displayName: "Sandy Cloak Burmy", types: ["bug", "ground"] },
  { slug: "burmy-trash", displayName: "Trash Cloak Burmy", types: ["bug", "steel"] },
];

// Direct background card URLs for base Pokémon where automated lookup fails or picks wrong card.
// Keyed by dex ID. These bypass tcgResult and go directly into bgCandidates.
// URL pattern: https://images.pokemontcg.io/{setId}/{cardNumber}_hires.png
const HARDCODED_BG_URLS: Record<number, string> = {
  // #022 Fearow: xyp-XY57 is the θ Evolution Black Star Promo ($61 full-art). The "xyp" set is
  // outside promoSvPick's scope (only scans "svp"), so this card is structurally unreachable by
  // any automated pass, not just losing a comparison — can't be converted to a blacklist entry.
  22: "https://images.pokemontcg.io/xyp/XY57_hires.png",
  // #077 Ponyta: Mainland China-exclusive promo full art. Not indexed by pokemontcg.io or
  // TCGdex (checked both — no data for this card/set), so pinned directly by URL.
  77: "https://s3.pokeos.com/pokeos-uploads/tcg/chn/574/107.webp?v=2026-04-01T20:23:04.000Z",
  // #385 Jirachi: xyp-XY67a ($191.65) is an XY Black Star Promo full art, same "xyp" set as
  // Fearow above — outside promoSvPick's scope, structurally unreachable by any automated pass.
  385: "https://images.pokemontcg.io/xyp/XY67a_hires.png",
  // #150 Mewtwo, #143 Snorlax: pinned directly to the plain SVP promo the user wants.
  // Trainer-owned cards ("Team Rocket's Mewtwo ex", "Rocket's Snorlax ex") kept winning via
  // one pass or another despite per-card blacklisting — hardcoding sidesteps that entirely.
  150: "https://images.pokemontcg.io/svp/52_hires.png",
  143: "https://images.pokemontcg.io/svp/51_hires.png",
};

// Direct fallback (cropped) card URLs for base Pokémon where automated lookup picks wrong card.
// Keyed by dex ID. These override fallbackCrop so the correct card shows cropped.
const HARDCODED_REGULAR_CARD_URLS: Record<number, string> = {
  // #123 Scyther: ex1-102 Scyther ex Ruby & Sapphire ($101) — pokemontcg.io shows $0 market
  // price for this card (stale data for old EX-era sets), so no price-based blacklist fix is
  // possible: excluding the current wrong pick would just promote a different wrong one.
  123: "https://images.pokemontcg.io/ex1/102_hires.png",
  // #125 Electabuzz: ex1-97 Electabuzz ex Ruby & Sapphire ($62) — same stale-price issue as Scyther.
  125: "https://images.pokemontcg.io/ex1/97_hires.png",
  // #412 Burmy, #413 Wormadam: every TCG card for these species is suffixed "X Cloak", which
  // nameMatches now excludes from the bare-species search (see FORME_VARIANT_SUFFIX_RE) to stop
  // Sandy/Trash Cloak cards winning the base entry — so the base (Plant Cloak, the default
  // in-game appearance) needs to be hardcoded directly instead of losing its card entirely.
  412: "https://images.pokemontcg.io/dp3/78_hires.png",
  413: "https://images.pokemontcg.io/dp3/41_hires.png",
};

// Direct image URLs for forms where the automated lookup picks a wrong/inferior card.
// Using URLs directly avoids a per-card API call that can fail under rate limits.
// URL pattern: https://images.pokemontcg.io/{setId}/{cardNumber}_hires.png
const HARDCODED_FORM_URLS: Record<string, string> = {
  // Mega Mewtwo X: automated pass returns xy8-160 instead, which may be an X/Y-variant name
  // mismatch rather than a losing-candidate issue — not yet root-caused enough to convert safely.
  "Mega Mewtwo X":   "https://images.pokemontcg.io/xy8/63_hires.png",
  // Sunny Forme Castform: sv8-195 is a genuine modern Illustration Rare full art — the only
  // Castform weather forme with one. Picked by hand since it isn't distinguishable from the
  // Rain/Snow-cloud formes by any automated pass (see HARDCODED_FORM_REGULAR_URLS below).
  "Sunny Forme Castform": "https://images.pokemontcg.io/sv8/195_hires.png",
  // Sky Forme Shaymin: every mainline TCG printing is just named "Shaymin" (Land and Sky
  // Forme aren't distinguished by card name), so the automated pass can't tell them apart and
  // just duplicates the base Shaymin card. Pocket TCG A2a-081 "Shaymin" (Triumphant Light) is
  // a star-rarity full-art card that's actually illustrated as the Sky Forme.
  "Sky Forme Shaymin": "https://assets.tcgdex.net/en/tcgp/A2a/081/high.webp",
};

// Curated cropped (non-full-art) card URLs for forms where no automated pass can distinguish
// the form at all — every "Deoxys" TCG printing shares one name regardless of battle forme,
// so these are the only cards literally named per forme (Legends Awakened, dp6), picked by hand.
const HARDCODED_FORM_REGULAR_URLS: Record<string, string> = {
  "Attack Forme Deoxys":  "https://images.pokemontcg.io/dp6/24_hires.png",
  "Defense Forme Deoxys": "https://images.pokemontcg.io/dp6/25_hires.png",
  "Speed Forme Deoxys":   "https://images.pokemontcg.io/dp6/26_hires.png",
  // Rain/Snow-cloud Castform: no full-art printing exists for either forme (unlike Sunny's
  // sv8-195), so these are the highest-value bordered cards for each, picked by hand.
  "Rainy Forme Castform": "https://images.pokemontcg.io/ex5/23_hires.png",
  "Snowy Forme Castform": "https://images.pokemontcg.io/ex5/25_hires.png",
  // Blaze/Aqua Breed Paldean Tauros: every TCG printing is just named "Paldean Tauros" with no
  // breed-distinguishing text, so picked by hand — highest-value Paldea Evolved print for each.
  "Blaze Breed Paldean Tauros": "https://images.pokemontcg.io/sv2/28_hires.png",
  "Aqua Breed Paldean Tauros":  "https://images.pokemontcg.io/sv2/41_hires.png",
  // Sandy/Trash Cloak Wormadam: real cards are named "Wormadam Sandy Cloak"/"Wormadam Trash
  // Cloak" (suffix-style, unlike our prefix-style displayName), so they aren't auto-searchable
  // the way Rotom's or Origin Forme's cards are — picked by hand, highest value per cloak.
  "Sandy Cloak Wormadam": "https://images.pokemontcg.io/pop7/10_hires.png",
  "Trash Cloak Wormadam": "https://images.pokemontcg.io/dp3/43_hires.png",
  // Sandy/Trash Cloak Burmy: same naming situation as Wormadam's cloaks above.
  "Sandy Cloak Burmy": "https://images.pokemontcg.io/pl4/57_hires.png",
  "Trash Cloak Burmy": "https://images.pokemontcg.io/dp3/80_hires.png",
  // Resolute Forme Keldeo: every mainline TCG printing is just named "Keldeo" (Ordinary/Resolute
  // Forme aren't distinguished by card name). User-confirmed card: swsh1-53 "Keldeo V" — a
  // bordered "Basic V" design, so cropped rather than full-bleed.
  "Resolute Forme Keldeo": "https://images.pokemontcg.io/swsh1/53_hires.png",
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

  // Family view grouping: familyId = lowest dex number in the chain (positions the group
  // among others); familyOrder = this Pokémon's index in the chain's evolution order (the
  // chain array is already baby → basic → stage 1 → stage 2 from fetchEvolutionChainIds' DFS).
  const familyByDex = new Map<number, { familyId: number; familyOrder: number }>();
  raw.forEach((p) => {
    const chain = chainsByDex.get(p.id);
    familyByDex.set(p.id, chain
      ? { familyId: Math.min(...chain), familyOrder: chain.indexOf(p.id) }
      : { familyId: p.id, familyOrder: 0 });
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
              homeSpriteUrl: null,
              category: "mega",
              tcgUrl: null,
            } satisfies AltForm);
          }
          if (p.id === 412) {
            for (const form of BURMY_CLOAK_FORMS) {
              filtered.push({
                slug: form.slug,
                displayName: form.displayName,
                types: form.types,
                artworkUrl: null,
                homeSpriteUrl: null,
                category: "forme",
                tcgUrl: null,
              } satisfies AltForm);
            }
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
  const promoSvEntries = await mapWithConcurrency(raw, 10, async p => {
    const url = await promoSvPick(promoData, toDisplayName(p.name));
    return url ? [p.id, { tcgUrl: url }] as const : null;
  });
  const promoSvMap = new Map(promoSvEntries.filter((e): e is NonNullable<typeof e> => e !== null));
  const trainerIrMap = new Map(raw.flatMap(p => {
    const url = trainerIrPick(irData, toDisplayName(p.name));
    return url ? [[p.id, { tcgUrl: url }]] : [];
  }));
  const trainerPromoEntries = await mapWithConcurrency(raw, 10, async p => {
    const url = await trainerPromoPick(promoData, toDisplayName(p.name));
    return url ? [p.id, { tcgUrl: url }] as const : null;
  });
  const trainerPromoMap = new Map(trainerPromoEntries.filter((e): e is NonNullable<typeof e> => e !== null));
  const trainerVgxMap = new Map(raw.flatMap(p => {
    const url = trainerVgxPick(vgxData, toDisplayName(p.name));
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
      !trainerIrMap.has(p.id) && !trainerPromoMap.has(p.id) && !trainerVgxMap.has(p.id) && !vgxMap.has(p.id);
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
            const hardcodedRegularUrl = HARDCODED_FORM_REGULAR_URLS[form.displayName];
            if (hardcodedRegularUrl) return { ...form, tcgUrl: null, regularCardUrl: hardcodedRegularUrl };
            const hardcodedUrl = HARDCODED_FORM_URLS[form.displayName];
            if (hardcodedUrl) return { ...form, tcgUrl: hardcodedUrl, regularCardUrl: null };

            // "forme" cards (e.g. Deoxys' Attack/Defense/Speed formes) aren't distinguished by
            // name in the TCG — every printing is just "Deoxys" — so search by the base
            // Pokémon's display name instead of the forme-specific display name.
            const searchName = form.category === "forme" ? toDisplayName(raw[i].name) : form.displayName;
            const irFromIndex = irSirPick(irSirCandidates(irData, searchName));
            const promoUrl = await promoSvPick(promoData, searchName);
            const trainerIrUrl = trainerIrPick(irData, searchName);
            const vgxFromIndex = vgxPick(vgxCandidates(vgxData, searchName));
            const ancientTraitUrl = ancientTraitPick(ancientTraitData, searchName);
            const fallbackUrl = fallbackArtPick(fallbackData, searchName);

            const [irFromFormCard, pocket, vgxFromFormCard, regionalPromoUrl] = await Promise.all([
              !irFromIndex ? fetchFormCard(form.category, raw[i].id, searchName, form.types, IR_RARITIES) : Promise.resolve(null),
              fetchPocketAltForm(searchName, form.category),
              !vgxFromIndex ? fetchFormCard(form.category, raw[i].id, searchName, form.types, VGX_RARITIES) : Promise.resolve(null),
              // Checked independently of vgxFromIndex — a shared-index winner shouldn't silently
              // block a curated full-art promo (e.g. Hisuian Electrode's SWSH294) from competing.
              form.category === "regional" ? fetchRegionalPromoPriority(searchName) : Promise.resolve(null),
            ]);

            const irUrl = irFromIndex?.tcgUrl ?? irFromFormCard?.tcgUrl ?? null;
            // isOldStyle = extended-art detection picked the bordered sibling: crop it, don't full-bleed it
            const vgxResult = vgxFromIndex ?? vgxFromFormCard;
            const vgxUrl = vgxResult && !vgxResult.isOldStyle ? vgxResult.tcgUrl : null;
            const vgxCropUrl = vgxResult?.isOldStyle ? vgxResult.tcgUrl : null;
            const tcgUrl = irUrl ?? promoUrl ?? (pocket.url || null) ?? trainerIrUrl ?? regionalPromoUrl ?? vgxUrl ?? ancientTraitUrl ?? null;
            const regularCardUrl = !tcgUrl && form.category !== "other"
              ? (vgxCropUrl ?? fallbackUrl ?? await fetchFormCardLastResort(searchName))
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
    const tcgResult = hardcodedBg ? { tcgUrl: hardcodedBg } : (irMap.get(p.id) ?? (!pocketUrl ? trainerIrMap.get(p.id) : undefined) ?? (!pocketUrl ? trainerPromoMap.get(p.id) : undefined) ?? (!pocketUrl ? trainerVgxMap.get(p.id) : undefined) ?? promoSvMap.get(p.id) ?? (!pocketUrl && ancientTraitUrl ? { tcgUrl: ancientTraitUrl } : undefined) ?? (!pocketUrl ? vgxMap.get(p.id) : undefined) ?? { tcgUrl: null });
    const fallbackCrop = HARDCODED_REGULAR_CARD_URLS[p.id] ?? (!hardcodedBg && !tcgResult.tcgUrl ? (fallbackArtMap.get(p.id) ?? lastResortMap.get(p.id)?.tcgUrl ?? undefined) : undefined);
    return toPokemonSummary(p, tcgResult, pocketUrl ? [pocketUrl] : [], speciesData[i].genus, altFormsWithCards[i], fallbackCrop, familyByDex.get(p.id));
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
        if (oldForm?.tcgUrl && !oldForm.tcgUrl.includes("scrydex.com")) form.tcgUrl = oldForm.tcgUrl;
        else if (oldForm?.regularCardUrl) form.regularCardUrl = oldForm.regularCardUrl;
      }
    }
  }

  // Apply hardcodes last — after preserve loop — so they always win.
  for (const p of pokemon) {
    const bgUrl = HARDCODED_BG_URLS[p.id];
    if (bgUrl) { p.bgCandidates = [bgUrl]; p.regularCardUrl = undefined; }
    const regularUrl = HARDCODED_REGULAR_CARD_URLS[p.id];
    if (regularUrl) { p.regularCardUrl = regularUrl; p.bgCandidates = []; }
  }

  writeFileSync(outPath, JSON.stringify(pokemon, null, 2));
  console.log(`Written ${pokemon.length} Pokémon to lib/pokemon-data.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
