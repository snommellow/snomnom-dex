import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgPromoSv, fetchTcgTrainerOwnedIrSir, fetchTcgVgx, fetchFormCard, IR_RARITIES, VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";

// PokéAPI includes phantom/unreleased megas in its game data (e.g. Clefable).
// Only show mega alt forms for Pokémon with canonical Gen 1 megas.
const CANONICAL_GEN1_MEGA_IDS = new Set([3, 6, 9, 15, 18, 65, 80, 94, 115, 127, 130, 142, 150]);

export default async function PokedexGrid() {
  const raw = await fetchFirst151();

  // Species data: genus + alt form slots + evolution chain URL (single fetch per Pokémon)
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

  // Fetch each unique evolution chain once, then build a map: dex ID → all chain members
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

  // Pass 1: IR/SIR — best quality full-art illustration cards, chain-set preferred
  const irMap = await fetchTcgIrSir(raw, chainsByDex);

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
  const vgxMap = await fetchTcgVgx(afterTrainerIr, chainsByDex);

  // Fetch alt form Pokémon data; filter out phantom megas PokéAPI lists for Gen 1
  const altFormsData = await Promise.all(
    raw.map((p, i) =>
      fetchAltForms(p.name, speciesData[i].altFormSlots).then((forms) =>
        forms.filter((f) => f.category !== "mega" || CANONICAL_GEN1_MEGA_IDS.has(p.id))
      )
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
