import { fetchFirst151, fetchSpeciesData, fetchAltForms, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgTrainerOwnedIrSir, fetchTcgVgx, fetchFormCard, IR_RARITIES, VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();

  // Pass 1: IR/SIR — best quality full-art illustration cards
  const irMap = await fetchTcgIrSir(raw);

  // Pass 2: TCG Pocket star cards (newest pack first)
  const afterIr = raw.filter((p) => !irMap.has(p.id));
  const pocketResultsList = afterIr.length
    ? await fetchPocketImages(afterIr.map((p) => ({ id: p.id, name: p.name })))
    : [];
  const pocketMap = new Map<number, string>();
  afterIr.forEach((p, j) => {
    if (pocketResultsList[j]?.url) pocketMap.set(p.id, pocketResultsList[j].url!);
  });

  // Pass 2.1: trainer-owned IR/SIR (e.g. "Erika's Clefable")
  const afterPocket = afterIr.filter((p) => !pocketMap.has(p.id));
  const trainerIrMap = await fetchTcgTrainerOwnedIrSir(afterPocket);

  // Pass 3: V/GX/EX — for Pokémon still missing after IR + Pocket passes
  const afterTrainerIr = afterPocket.filter((p) => !trainerIrMap.has(p.id));
  const vgxMap = await fetchTcgVgx(afterTrainerIr);

  // Species data: genus + alt form slots (single fetch per Pokémon)
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

  // Fetch alt form Pokemon data for all Pokémon
  const altFormsData = await Promise.all(
    raw.map((p, i) => fetchAltForms(p.name, speciesData[i].altFormSlots))
  );

  // Fetch TCG cards for each alt form — same priority as main cards:
  // Pass A: SIR/IR → Pass B: Pocket star cards → Pass C: TG + VGX → artwork
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
          // Pass C: TG (regional) + older TCG full-art (Secret/Ultra/Holo V/GX)
          const vgxUrl = await fetchFormCard(form.category, raw[i].id, form.displayName, form.types, VGX_RARITIES);
          return { ...form, tcgUrl: vgxUrl ?? null };
        })
      )
    )
  );

  const pokemon = raw.map((p, i) => {
    const tcgResult = irMap.get(p.id) ?? trainerIrMap.get(p.id) ?? vgxMap.get(p.id) ?? { tcgUrl: null };
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
