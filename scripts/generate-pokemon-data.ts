#!/usr/bin/env tsx
// Generates lib/pokemon-data.json — run with: npm run generate
// Optional: set POKEMONTCG_API_KEY env var to avoid rate limits.

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { fetchFirst151, fetchSpeciesData, fetchAltForms, fetchEvolutionChainIds, toPokemonSummary, type AltForm, type PokemonSummary } from "../lib/pokeapi";
import {
  buildIrSirData, buildTeraIrSirData, irSirCandidates, irSirPick, trainerIrPick,
  buildVgxData, vgxCandidates, vgxPick, trainerVgxPick,
  buildAncientTraitData, ancientTraitPick,
  buildFallbackArtData, fallbackArtPick,
  fetchFormCard, fetchFormCardLastResort, fetchRegionalPromoPriority,
  fetchTcgLastResort, toDisplayName, randomFormePick,
  IR_RARITIES, VGX_RARITIES,
} from "../lib/tcgapi";
import { buildChainSets } from "../lib/chains";
import { fetchPocketImages, fetchPocketAltForm, fetchPocketFallback } from "../lib/pocketapi";

const TCG_ONLY_MEGAS: Record<number, { displayName: string; types: string[] }> = {
  149: { displayName: "Mega Dragonite", types: ["dragon", "flying"] },
  // No card image confirmed yet; entry exists so the automated search picks it up once the
  // TCG API indexes the card, without needing another manual pass.
  678: { displayName: "Mega Meowstic", types: ["psychic"] },
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
  678: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B3/B3_165_EN_SM.webp", // Meowstic (Male), full art
  // #987 Flutter Mane, #995 Iron Thorns: svp-97/98's crop treatment showed border/text bleeding
  // through (confirmed by user); switched to full-bleed background instead.
  987: "https://images.pokemontcg.io/svp/97_hires.png",
  995: "https://images.pokemontcg.io/svp/98_hires.png",
  894: "https://images.pokemontcg.io/swshp/SWSH280_hires.png", // Regieleki V, SWSH Black Star Promos
  892: "https://images.pokemontcg.io/swsh5/151_hires.png", // Urshifu (Single Strike Style V), Battle Styles
  // Zacian/Zamazenta: automated pass was assigning me2-100/sv10-201 to the base (Hero of Many
  // Battles) entity, but those cards belong to the Crowned Sword/Shield forms instead (moved
  // below via HARDCODED_FORM_URLS) — user confirmed the swap. Base now has no card pinned until
  // a genuine Hero of Many Battles card is provided.
  876: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2/B2_169_EN_SM.webp", // Indeedee (Male)
  720: "https://images.scrydex.com/pokemon/xyp_ja-155/medium", // Hoopa (Confined)
  // #855 Polteageist: swshp-SWSH021's crop treatment showed border/text bleeding through
  // (confirmed by user); switched to full-bleed background instead.
  855: "https://images.pokemontcg.io/swshp/SWSH021_hires.png",
  832: "https://images.pokemontcg.io/swshp/SWSH049_hires.png", // Dubwool V, SWSH Black Star Promos
  // #786 Tapu Lele, #788 Tapu Fini: both have a real "One Star" Pocket TCG card (A3-170/A3-164,
  // same tier as Tapu Koko's A3-166), but TCGdex's per-rarity search query consistently returns
  // no results for these two specific name+rarity combos despite the cards existing (confirmed
  // via direct card-detail lookup) — a third-party API search quirk, not a bug in our filtering
  // logic. Hardcoded directly rather than reworking the whole Pocket-fetch pipeline for it.
  786: "https://assets.tcgdex.net/en/tcgp/A3/170/high.webp", // Tapu Lele
  788: "https://assets.tcgdex.net/en/tcgp/A3/164/high.webp", // Tapu Fini
  796: "https://images.pokemontcg.io/smp/SM68_hires.png", // Xurkitree-GX, SM Black Star Promos
  718: "https://images.pokemontcg.io/smp/SM122_hires.png", // Zygarde (50% Forme)
  139: "https://images.pokemontcg.io/swsh12/35_hires.png", // Omastar V, Silver Tempest
  985: "https://images.pokemontcg.io/svp/65_hires.png", // Scream Tail
  // #022 Fearow: xyp-XY57 is the θ Evolution Black Star Promo ($61 full-art). The "xyp" set is
  // outside promoSvPick's scope (only scans "svp"), so this card is structurally unreachable by
  // any automated pass, not just losing a comparison — can't be converted to a blacklist entry.
  22: "https://images.pokemontcg.io/xyp/XY57_hires.png",
  // #077 Ponyta: Mainland China-exclusive promo full art. Not indexed by pokemontcg.io or
  // TCGdex (checked both — no data for this card/set), so pinned directly by URL.
  77: "https://s3.pokeos.com/pokeos-uploads/tcg/chn/574/107.webp?v=2026-04-01T20:23:04.000Z",
  385: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/P-B/P-B_025_EN_SM.webp", // Jirachi
  443: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/P-A/P-A_046_EN_SM.webp", // Gible
  935: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_022_R_EN_LG.png", // Charcadet
  390: "https://images.scrydex.com/pokemon/mep-41/medium", // Chimchar
  728: "https://images.scrydex.com/pokemon/mep-45/medium", // Popplio
  816: "https://images.scrydex.com/pokemon/mep-54/medium", // Sobble
  810: "https://images.scrydex.com/pokemon/mep-52/medium", // Grookey
  696: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_070_R_EN_LG.png", // Tyrunt
  // #82 Magneton, #164 Noctowl, #230 Kingdra, #374 Beldum, #658 Greninja, #991 Iron Bundle:
  // pinned full-art picks.
  877: "https://images.pokemontcg.io/svp/206_hires.png", // Morpeko (Full Belly Mode) — Marnie's Morpeko
  1017: "https://images.pokemontcg.io/svp/123_hires.png", // Ogerpon (Teal Mask)
  778: "https://images.pokemontcg.io/svp/75_hires.png", // Mimikyu
  741: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_024_R_EN.png", // Oricorio (Baile Style)
  82: "https://images.pokemontcg.io/svp/159_hires.png",
  164: "https://images.pokemontcg.io/svp/141_hires.png",
  230: "https://images.pokemontcg.io/svp/131_hires.png",
  374: "https://images.pokemontcg.io/svp/207_hires.png",
  658: "https://images.pokemontcg.io/svp/132_hires.png",
  991: "https://images.pokemontcg.io/svp/66_hires.png",
  // #150 Mewtwo: pinned directly to the promo the user wants. Trainer-owned cards
  // ("Team Rocket's Mewtwo ex") kept winning via one pass or another despite per-card
  // blacklisting — hardcoding sidesteps that entirely. Snorlax's equivalent hardcode was
  // dropped so it falls through to the automated pick instead.
  150: "https://images.pokemontcg.io/svp/52_hires.png",
  // #576 Gothitelle, #494 Victini, #642 Thundurus, #641 Tornadus: user-provided full-art SVP
  // promos (#211/#208/#209/#210), not yet indexed by pokemontcg.io — pinned directly by URL.
  576: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_211_R_EN.png",
  494: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_208_R_EN_LG.png",
  642: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_209_R_EN.png",
  641: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_210_R_EN.png",
  // #93 Haunter: user-provided Mega Evolution Powers promo (MEP 027), not indexed by
  // pokemontcg.io or tcgdex — pinned directly by URL, full-bleed per user confirmation.
  93: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_027_R_EN.png",
  // #653 Fennekin: user-provided Mega Evolution Black Star Promos card (MEP 080).
  653: "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/MEP/MEP_080_R_EN.png",
  // #652 Chesnaught, #655 Delphox: user-provided full-art V cards.
  652: "https://images.pokemontcg.io/swsh12/15_hires.png",
  655: "https://images.pokemontcg.io/swsh11/27_hires.png",
  // #487 Giratina (Altered Forme): user-confirmed swap — this Pocket TCG card actually depicts
  // the Altered Forme design, while swsh11-186 (the automated pick) actually depicts Origin
  // Forme's design despite being a plain "Giratina V" card name — see "Origin Forme Giratina"
  // hardcode below for the other half of the swap.
  487: "https://assets.tcgdex.net/en/tcgp/A2b/096/high.webp",
};

// Direct fallback (cropped) card URLs for base Pokémon where automated lookup picks wrong card.
// Keyed by dex ID. These override fallbackCrop so the correct card shows cropped.
const HARDCODED_REGULAR_CARD_URLS: Record<number, string> = {
  // #084 Doduo: xy12-112 "Imakuni?'s Doduo" (a novelty/gag card) was winning as a full-bleed
  // background; moved to cropped treatment instead (user confirmed).
  84: "https://images.pokemontcg.io/xy12/112_hires.png",
  // #916 Oinkologne (Male): sv1-234 "Oinkologne ex" cropped with border/text bleeding through
  // (confirmed by user); sv1-157 is a plain Stage 1 card with no ability box, crops cleanly.
  916: "https://images.pokemontcg.io/sv1/157_hires.png",
  // #930 Arboliva, #942 Maschiff, #970 Glimmora, #979 Annihilape, #980 Clodsire: the highest-
  // market-value candidate for each is a full-art "ex" card with ability/attack text overlapping
  // the illustration, which bleeds through when center-cropped for the regular-card treatment
  // (confirmed by user screenshot). Picked a plain, bounded-illustration card instead — same
  // fix pattern as Oinkologne above.
  930: "https://images.pokemontcg.io/sv1/23_hires.png",
  942: "https://images.pokemontcg.io/sv1/135_hires.png",
  970: "https://images.pokemontcg.io/sv2/126_hires.png",
  979: "https://images.pokemontcg.io/sv1/109_hires.png",
  980: "https://images.pokemontcg.io/sv3/128_hires.png",
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
  "Blade Forme Aegislash": "https://images.pokemontcg.io/swsh4/126_hires.png",
  // Squawkabilly's Blue/Yellow/White Plumage forms: no real TCG card depicts anything but Green
  // Plumage (checked every card across all sets) — sv2-264 is the only card that actually shows
  // all four colors (in the background), so it's used for these three too (user-confirmed).
  "Blue Plumage Squawkabilly": "https://images.pokemontcg.io/sv2/264_hires.png",
  "Yellow Plumage Squawkabilly": "https://images.pokemontcg.io/sv2/264_hires.png",
  "White Plumage Squawkabilly": "https://images.pokemontcg.io/sv2/264_hires.png",
  // Terapagos' formes aren't distinguished by card name — base (Normal Forme) is auto-found via
  // sv7-170 (SIR, Stellar Crown); these two are pinned to distinct cards from the same species
  // to avoid duplicating it.
  "Terastal Forme Terapagos": "https://images.pokemontcg.io/sv7/173_hires.png",
  "Stellar Forme Terapagos": "https://images.pokemontcg.io/sv8pt5/169_hires.png",
  "Family of Three Maushold": "https://static.tcgcollector.com/content/images/8f/8b/a4/8f8ba478216673d31a6772e2d122f0e276bc4eaaa16e0dcd560a528b1bcaf52d.webp",
  // Therian Forme isn't distinguished by name in the TCG, so it was duplicating base Enamorus's
  // own sv6-180 pick — pinned to a different, distinct Enamorus V print instead.
  "Therian Forme Enamorus": "https://images.pokemontcg.io/swsh11tg/TG18_hires.png",
  "Ice Rider Calyrex": "https://images.pokemontcg.io/swsh6/164_hires.png",
  "Shadow Rider Calyrex": "https://images.pokemontcg.io/swsh6/172_hires.png",
  "Rapid Strike Urshifu": "https://images.pokemontcg.io/swsh5/153_hires.png",
  "Gigantamax Single Strike Urshifu": "https://images.pokemontcg.io/swsh5/168_hires.png",
  "Gigantamax Rapid Strike Urshifu": "https://images.pokemontcg.io/swsh5/170_hires.png",
  "Eternamax Eternatus": "https://images.pokemontcg.io/swsh11tg/TG22_hires.png",
  "Crowned Sword Zacian": "https://images.pokemontcg.io/me2/100_hires.png",
  "Crowned Shield Zamazenta": "https://images.pokemontcg.io/sv10/201_hires.png",
  "Female Indeedee": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B1/B1_278_EN_SM.webp",
  "Midnight Form Lycanroc": "https://images.pokemontcg.io/sm2/74_hires.png",
  "Gigantamax Hatterene": "https://images.pokemontcg.io/swsh12pt5gg/GG47_hires.png",
  // Only one real Toxtricity VMAX print exists (no separate Amped/Low Key Gigantamax cards).
  "Gigantamax Amped Toxtricity": "https://images.pokemontcg.io/swsh2/71_hires.png",
  "Gigantamax Low Key Toxtricity": "https://images.pokemontcg.io/swsh2/71_hires.png",
  "Low Key Form Toxtricity": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B2/B2_198_EN.png",
  "Hisuian Zorua": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/P-B/P-B_076_EN_SM.webp",
  "Busted Form Mimikyu": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/P-A/P-A_066_EN_SM.webp",
  "Sensu Style Oricorio": "https://images.pokemontcg.io/sm12/95_hires.png",
  "Pom-Pom Style Oricorio": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/A3/A3_165_EN_SM.webp",
  "Pa'u Style Oricorio": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B3/B3_166_EN_SM.webp",
  "Hoopa Unbound": "https://images.pokemontcg.io/swsh12pt5gg/GG53_hires.png",
  "Complete Forme Zygarde": "https://images.pokemontcg.io/sm6/73_hires.png",
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
  // Pirouette Forme Meloetta: every printing shares Aria Forme's card name. User-provided
  // full-art Pocket TCG card (Genetic Apex sibling set) actually depicts the Pirouette design.
  "Pirouette Forme Meloetta": "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pocket/B3/B3_170_EN.png",
  // White/Black Kyurem: user-confirmed XY Black Star Promos full arts, overriding whatever the
  // automated "regional" search (auto-searches by full displayName) picks instead.
  "White Kyurem": "https://images.pokemontcg.io/xyp/XY81_hires.png",
  "Black Kyurem": "https://images.pokemontcg.io/xyp/XY80_hires.png",
  // Resolute Forme Keldeo: user confirmed swsh1-53 "Keldeo V" should render full-bleed, not
  // cropped (previously miscategorized as a bordered design — same correction as Origin Forme
  // Dialga/Palkia's FORCE_CROP_IDS revert).
  "Resolute Forme Keldeo": "https://images.pokemontcg.io/swsh1/53_hires.png",
  // Hisuian Samurott/Zoroark: user-confirmed Crown Zenith Galarian Gallery cards. Pinned
  // directly rather than relying on the automated pass — the real set id is "swsh12pt5gg" (not
  // "swsh12pt5" as first assumed), so an earlier blacklist attempt on the wrong id was a silent
  // no-op, letting yet other candidates win instead.
  "Hisuian Samurott": "https://images.pokemontcg.io/swsh12pt5gg/GG51_hires.png",
  "Hisuian Zoroark": "https://images.pokemontcg.io/swsh12pt5gg/GG56_hires.png",
  // Therian Forme Thundurus/Tornadus/Landorus: every TCG printing is just named "Thundurus"/
  // "Tornadus"/"Landorus" (Incarnate/Therian aren't distinguished by card name). User-provided
  // full-art Plasma Freeze/Boundaries Crossed EX cards, full-bleed rather than cropped.
  "Therian Forme Thundurus": "https://images.pokemontcg.io/bw9/110_hires.png",
  "Therian Forme Tornadus":  "https://images.pokemontcg.io/bw9/114_hires.png",
  "Therian Forme Landorus":  "https://images.pokemontcg.io/bw7/144_hires.png",
  // Origin Forme Giratina: user-confirmed swap — swsh11-186 "Giratina V" actually depicts the
  // Origin Forme design, while the automated "regional" search's own pick (A2b-096, a Pocket
  // card) actually depicts Altered Forme and is now hardcoded to base Giratina instead (dex 487
  // in HARDCODED_BG_URLS above).
  "Origin Forme Giratina": "https://images.pokemontcg.io/swsh11/186_hires.png",
};

// Curated cropped (non-full-art) card URLs for forms where no automated pass can distinguish
// the form at all — every "Deoxys" TCG printing shares one name regardless of battle forme,
// so these are the only cards literally named per forme (Legends Awakened, dp6), picked by hand.
const HARDCODED_FORM_REGULAR_URLS: Record<string, string> = {
  "Noice Face Eiscue": "https://images.pokemontcg.io/swsh9/44_hires.png",
  // Distinct art from base Oinkologne's sv1-157 (this one actually depicts the Female design).
  "Female Oinkologne": "https://images.pokemontcg.io/sv3/184_hires.png",
  "10% Forme Zygarde": "https://images.pokemontcg.io/sm11/124_hires.png",
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
  // Blue/White-Striped Basculin: every TCG printing is just named "Basculin" (no stripe-color
  // text), so picked by hand — two distinct highest-value candidates, both plain Common/Uncommon
  // (no full-art Basculin printing exists at all), distinct from Red-Striped's rsv10pt5-108.
  // swsh8-70's art and flavor text ("fights with schools of red-striped Basculin") both confirm
  // this depicts the Blue-Striped variety specifically, unlike bw2-24/bw1-35/bw2-25/rsv10pt5-24
  // which all show the red-striped color scheme despite generic "Basculin" naming.
  "Blue-Striped Basculin": "https://images.pokemontcg.io/swsh8/70_hires.png",
  // White-Striped Basculin is the variety with the hidden ability that evolves into
  // Basculegion in Hisui, and the TCG printed it under the distinct name "Hisuian Basculin"
  // (SWSH Black Star Promos SWSH273) rather than plain "Basculin" like the other two forms.
  "White-Striped Basculin": "https://images.pokemontcg.io/swshp/SWSH273_hires.png",
  // Zen Mode Darmanitan / Zen Mode Galarian Darmanitan: every TCG printing is just named
  // "Darmanitan"/"Galarian Darmanitan" (Standard/Zen Mode aren't distinguished by card name),
  // and both Zen forms were duplicating the same automated pick. User-confirmed cards:
  // bw4-60 "Darmanitan" (Next Destinies, Zen Mode art) and swsh3-28 "Galarian Darmanitan"
  // (Darkness Ablaze, Zen Mode Galarian art).
  "Zen Mode Darmanitan": "https://images.pokemontcg.io/bw4/60_hires.png",
  "Zen Mode Galarian Darmanitan": "https://images.pokemontcg.io/swsh3/28_hires.png",
};

// Shared priority order for resolving a Pokémon's (or alt form's) card image url — used
// identically whether it's a base Pokémon or an alt form, so there's exactly one place that
// defines "what beats what". Once Pocket has an image, no lower automated/manual tier is
// allowed to override it — they only fill the gap when Pocket has nothing.
function pickTcgUrl(tiers: {
  ir: string | null;
  pocket: string | null;
  hardcoded: string | null;
  trainerIr: string | null;
  trainerVgx: string | null;
  ancientTrait: string | null;
  vgx: string | null;
  teraIr: string | null;
}): string | null {
  const { ir, pocket, hardcoded, trainerIr, trainerVgx, ancientTrait, vgx, teraIr } = tiers;
  return ir
    ?? pocket
    ?? hardcoded
    ?? (!pocket ? trainerIr : null)
    ?? (!pocket ? trainerVgx : null)
    ?? (!pocket ? ancientTrait : null)
    ?? (!pocket ? vgx : null)
    ?? (!pocket ? teraIr : null)
    ?? null;
}

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
  const [irData, teraIrData, vgxData, ancientTraitData, fallbackData, altFormsData] = await Promise.all([
    buildIrSirData(),
    buildTeraIrSirData(),
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

  const teraIrCandidatesList = raw.map(p => irSirCandidates(teraIrData, toDisplayName(p.name)));
  const teraIrSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(teraIrCandidatesList[i].map(c => c.set.id))]));
  const teraIrChainSetsMap = buildChainSets(teraIrSetsByDex, chainsByDex);

  const vgxCandidatesList = raw.map(p => vgxCandidates(vgxData, toDisplayName(p.name)));
  const vgxSetsByDex = new Map(raw.map((p, i) => [p.id, new Set(vgxCandidatesList[i].map(c => c.set.id))]));
  const vgxChainSetsMap = buildChainSets(vgxSetsByDex, chainsByDex);

  const irMap = new Map(raw.flatMap((p, i) => {
    const r = irSirPick(irCandidatesList[i], irChainSetsMap.get(p.id));
    return r ? [[p.id, r]] : [];
  }));
  // Tera-type IR/SIR: a separate, lower-priority tier (positioned after Ancient Trait in the
  // main chain below) — Tera reprints shouldn't outrank a genuine full-art illustration, but are
  // still worth showing over nothing.
  const teraIrMap = new Map(raw.flatMap((p, i) => {
    const r = irSirPick(teraIrCandidatesList[i], teraIrChainSetsMap.get(p.id));
    return r ? [[p.id, r]] : [];
  }));
  const trainerIrMap = new Map(raw.flatMap(p => {
    const url = trainerIrPick(irData, toDisplayName(p.name));
    return url ? [[p.id, { tcgUrl: url }]] : [];
  }));
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
    if (allPocketResults[j]?.url && !irMap.has(p.id)) {
      pocketMap.set(p.id, allPocketResults[j].url!);
    }
  });

  const noCardPokemon = raw.filter((p) => {
    const pocketUrl = pocketMap.get(p.id);
    return !irMap.has(p.id) && !pocketUrl &&
      !trainerIrMap.has(p.id) && !trainerVgxMap.has(p.id) && !vgxMap.has(p.id);
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

            // Pumpkaboo/Gourgeist's Small/Large/Super forms: no card distinguishes sizes by
            // name and no full-art printing exists yet, so pick a deterministic pseudo-random
            // candidate per size instead of always showing the same "highest value" card for
            // all three (see randomFormePick's comment in lib/tcgapi.ts).
            if (/^(Small|Large|Super) (Pumpkaboo|Gourgeist)$/.test(form.displayName)) {
              const base = toDisplayName(raw[i].name);
              const randomUrl = await randomFormePick(base, form.displayName);
              return { ...form, tcgUrl: null, regularCardUrl: randomUrl };
            }

            // "forme" cards (e.g. Deoxys' Attack/Defense/Speed formes) aren't distinguished by
            // name in the TCG — every printing is just "Deoxys" — so search by the base
            // Pokémon's display name instead of the forme-specific display name.
            const searchName = form.category === "forme" ? toDisplayName(raw[i].name) : form.displayName;
            const irFromIndex = irSirPick(irSirCandidates(irData, searchName));
            const teraIrFromIndex = irSirPick(irSirCandidates(teraIrData, searchName));
            const trainerIrUrl = trainerIrPick(irData, searchName);
            const trainerVgxUrl = trainerVgxPick(vgxData, searchName);
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
            const pocketUrl = pocket.url || null;

            // Same pickTcgUrl priority order used for base Pokémon — regional promo (a curated,
            // manual lookup, no base-Pokémon equivalent) folds into the "hardcoded" tier slot
            // since it plays the same role: a manual pick filling a gap the automated tiers miss.
            const tcgUrl = pickTcgUrl({
              ir: irUrl,
              pocket: pocketUrl,
              hardcoded: regionalPromoUrl ?? null,
              trainerIr: trainerIrUrl,
              trainerVgx: trainerVgxUrl,
              ancientTrait: ancientTraitUrl,
              vgx: vgxUrl,
              teraIr: teraIrFromIndex?.tcgUrl ?? null,
            });
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
    // Uses the same pickTcgUrl priority order shared with alt forms below — see its comment.
    const tcgResult = {
      tcgUrl: pickTcgUrl({
        ir: irMap.get(p.id)?.tcgUrl ?? null,
        pocket: pocketUrl ?? null,
        hardcoded: hardcodedBg ?? null,
        trainerIr: trainerIrMap.get(p.id)?.tcgUrl ?? null,
        trainerVgx: trainerVgxMap.get(p.id)?.tcgUrl ?? null,
        ancientTrait: ancientTraitUrl ?? null,
        vgx: vgxMap.get(p.id)?.tcgUrl ?? null,
        teraIr: teraIrMap.get(p.id)?.tcgUrl ?? null,
      }),
    };
    const fallbackCrop = HARDCODED_REGULAR_CARD_URLS[p.id] ?? (!tcgResult.tcgUrl ? (fallbackArtMap.get(p.id) ?? lastResortMap.get(p.id)?.tcgUrl ?? undefined) : undefined);
    return toPokemonSummary(p, tcgResult, (pocketUrl && tcgResult.tcgUrl !== pocketUrl) ? [pocketUrl] : [], speciesData[i].genus, altFormsWithCards[i], fallbackCrop, familyByDex.get(p.id));
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

  // User-requested swap: Crowned Sword/Shield become the primary entity shown in the main grid,
  // with Hero of Many Battles demoted to an alt form — the reverse of PokéAPI's default variety
  // assignment (which treats Hero of Many Battles as the base species). Swaps types/artwork/
  // sprites/cards between the base entry and its Crowned alt form, and relabels the alt form.
  for (const [dexId, crownedSlug, heroLabel] of [
    [888, "zacian-crowned", "Zacian Hero of Many Battles"],
    [889, "zamazenta-crowned", "Zamazenta Hero of Many Battles"],
  ] as const) {
    const p = pokemon.find(x => x.id === dexId);
    const crownedForm = p?.altForms.find(f => f.slug === crownedSlug);
    if (!p || !crownedForm) continue;
    const heroSnapshot = {
      types: p.types, artworkUrl: p.artworkUrl, spriteUrl: p.spriteUrl,
      bgCandidates: p.bgCandidates, regularCardUrl: p.regularCardUrl,
    };
    p.types = crownedForm.types;
    p.artworkUrl = crownedForm.artworkUrl;
    p.spriteUrl = crownedForm.homeSpriteUrl ?? crownedForm.formSpriteUrl ?? p.spriteUrl;
    p.bgCandidates = crownedForm.tcgUrl ? [crownedForm.tcgUrl] : [];
    p.regularCardUrl = crownedForm.regularCardUrl ?? undefined;
    crownedForm.displayName = heroLabel;
    crownedForm.types = heroSnapshot.types;
    crownedForm.artworkUrl = heroSnapshot.artworkUrl;
    crownedForm.homeSpriteUrl = heroSnapshot.spriteUrl;
    crownedForm.formSpriteUrl = heroSnapshot.spriteUrl;
    crownedForm.tcgUrl = heroSnapshot.bgCandidates[0] ?? null;
    crownedForm.regularCardUrl = heroSnapshot.regularCardUrl ?? null;
  }

  writeFileSync(outPath, JSON.stringify(pokemon, null, 2));
  console.log(`Written ${pokemon.length} Pokémon to lib/pokemon-data.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
