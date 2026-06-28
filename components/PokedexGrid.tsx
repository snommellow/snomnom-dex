import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgPromoSv, fetchTcgTrainerOwnedIrSir, fetchTcgVgx, fetchFormCard, IR_RARITIES, VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import { fetchPtcgSetsByDexRange } from "@/lib/pokemontcgapi";
import { buildChainSets } from "@/lib/chains";
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

  // Fetch evolution chains and pokemontcg.io set memberships in parallel
  const uniqueChainUrls = [...new Set(speciesData.map(s => s.evolutionChainUrl).filter(Boolean) as string[])];
  const minDex = Math.min(...raw.map(p => p.id));
  const maxDex = Math.max(...raw.map(p => p.id));
  const [chainResults, ptcgSetsByDex] = await Promise.all([
    Promise.all(uniqueChainUrls.map(url => fetchEvolutionChainIds(url))),
    fetchPtcgSetsByDexRange(minDex, maxDex),
  ]);
  const urlToIds = new Map(uniqueChainUrls.map((url, i) => [url, chainResults[i]]));

  const chainsByDex = new Map<number, number[]>();
  speciesData.forEach((s, i) => {
    if (s.evolutionChainUrl) {
      const ids = urlToIds.get(s.evolutionChainUrl) ?? [];
      if (ids.length > 1) chainsByDex.set(raw[i].id, ids);
    }
  });

  const tcgChainSets = buildChainSets(ptcgSetsByDex, chainsByDex);

  // Pass 1: IR/SIR — best quality full-art illustration cards, chain-set preferred
  const irMap = await fetchTcgIrSir(raw, tcgChainSets);

  // Pass 1.5: SV-era full-art promos (svp set, highest localId = best quality)
  const afterIr = raw.filter((p) => !irMap.has(p.id));
  const promoSvMap = await fetchTcgPromoSv(afterIr);

  // Pass 2: TCG Pocket star cards, chain-set preferred (newest pack first as tiebreaker)
  const afterPromoSv = afterIr.filter((p) => !promoSvMap.has(p.id));
  const pocketResultsList = afterPromoSv.length
    ? await fetchPocketImages(afterPromoSv.map((p) => ({ id: p.id, name: p.name })), chainsByDex)
    : [];
  const pocketMap = new Map<number, string>();
  afterPromoSv.forEach((p, j) => {
    if (pocketResultsList[j]?.url) pocketMap.set(p.id, pocketResultsList[j].url!);
  });

  // Pass 2.1: trainer-owned IR/SIR (e.g. "Erika's Clefable")
  const afterPocket = afterPromoSv.filter((p) => !pocketMap.has(p.id));
  const trainerIrMap = await fetchTcgTrainerOwnedIrSir(afterPocket);

  // Pass 3: V/GX/EX — for Pokémon still missing after all earlier passes, chain-set preferred
  const afterTrainerIr = afterPocket.filter((p) => !trainerIrMap.has(p.id));
  const vgxMap = await fetchTcgVgx(afterTrainerIr, tcgChainSets);

  // Fetch alt form Pokémon data.
  // Phantom megas in PokéAPI (e.g. Clefable) have no official artwork — filter those out.
  // Inject TCG_ONLY_MEGAS for Pokémon whose mega exists in the TCG but not yet in PokéAPI.
  const altFormsData = await Promise.all(
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
  );

  // Fetch TCG cards for each alt form — same priority as main cards:
  // Pass A: SIR/IR → Pass B: Pocket star cards → Pass C: TG (regional) + VGX → artwork
  const altFormsWithCards = await Promise.all(
    altFormsData.map((forms, i) =>
      Promise.all(
        forms.map(async (form) => {
          // Pass A: SIR / IR
          const irUrl = await fetchFormCard(form.category, raw[i].id, form.displayName, form.types, IR_RARITIES);
          if (irUrl) return { ...form, tcgUrl: irUrl };
          // Pass B: Pocket star cards (★★★ > ★★ rainbow > ★)
          const pocket = await fetchPocketAltForm(form.displayName, form.category);
          if (pocket.url) return { ...form, tcgUrl: pocket.url };
          // Pass C: TG (regional) + older TCG full-art (Hyper rare / Ultra Rare / Holo V)
          const vgxUrl = await fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES);
          return { ...form, tcgUrl: vgxUrl ?? null };
        })
      )
    )
  );

  const pokemon = raw.map((p, i) => {
    const tcgResult = irMap.get(p.id) ?? trainerIrMap.get(p.id) ?? promoSvMap.get(p.id) ?? vgxMap.get(p.id) ?? { tcgUrl: null };
    const pocketUrl = pocketMap.get(p.id);
    return toPokemonSummary(
      p,
      tcgResult,
      pocketUrl ? [pocketUrl] : [],
      speciesData[i].genus,
      altFormsWithCards[i],
    );
  });

  return <PokedexClient pokemon={pokemon} />;
}
