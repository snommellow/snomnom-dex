import { fetchFirst151, fetchSpeciesData, fetchAltForms, toPokemonSummary } from "@/lib/pokeapi";
import { fetchTcgIrSir, fetchTcgVgx, fetchFormCard, FORM_IR_RARITIES, FORM_VGX_RARITIES } from "@/lib/tcgapi";
import { fetchPocketImages, fetchPocketAltForm } from "@/lib/pocketapi";
import PokedexClient from "./PokedexClient";

export default async function PokedexGrid() {
  const raw = await fetchFirst151();
  const ids = raw.map((p) => p.id);

  // Pass 1: IR/SIR — best quality full-art illustration cards
  const irMap = await fetchTcgIrSir(ids);

  // Pass 2: TCG Pocket star cards — for Pokémon missing IR/SIR
  const afterIr = ids.filter((id) => !irMap.has(id));
  const pocketResultsList = afterIr.length
    ? await fetchPocketImages(afterIr.map((id) => {
        const p = raw.find((r) => r.id === id)!;
        return { id, name: p.name };
      }))
    : [];
  const pocketMap = new Map<number, string>();
  afterIr.forEach((id, j) => {
    if (pocketResultsList[j]?.url) pocketMap.set(id, pocketResultsList[j].url!);
  });

  // Pass 3: V/GX/EX — for Pokémon still missing after IR/SIR + Pocket
  const afterPocket = afterIr.filter((id) => !pocketMap.has(id));
  const vgxMap = await fetchTcgVgx(afterPocket);

  // Species data: genus + alt form slots (single fetch per Pokémon)
  const speciesData = await Promise.all(raw.map((p) => fetchSpeciesData(p.id)));

  // Fetch alt form Pokemon data for all Pokémon
  const altFormsData = await Promise.all(
    raw.map((p, i) => fetchAltForms(p.name, speciesData[i].altFormSlots))
  );

  // Fetch TCG cards for each alt form — same priority as main cards:
  // Pass A: SIR/IR → Pass B: Pocket star cards → Pass C: older TCG (VGX/Holo EX) → artwork
  const altFormsWithCards = await Promise.all(
    altFormsData.map((forms, i) =>
      Promise.all(
        forms.map(async (form) => {
          // Pass A: SIR / IR
          const irUrl = await fetchFormCard(form.category, raw[i].id, form.displayName, form.types, FORM_IR_RARITIES);
          if (irUrl) return { ...form, tcgUrl: irUrl };
          // Pass B: Pocket star cards (★★★ > ★★ rainbow > ★)
          const pocket = await fetchPocketAltForm(form.displayName, form.category, raw[i].name);
          if (pocket.url) return { ...form, tcgUrl: pocket.url };
          // Pass C: older TCG full-art (Secret/Ultra/Holo EX/GX/V)
          const vgxUrl = await fetchFormCard(form.category, raw[i].id, form.displayName, form.types, FORM_VGX_RARITIES);
          return { ...form, tcgUrl: vgxUrl ?? null };
        })
      )
    )
  );

  const pokemon = raw.map((p, i) => {
    const tcgResult = irMap.get(p.id) ?? vgxMap.get(p.id) ?? { tcgUrl: null };
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
