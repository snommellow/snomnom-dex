// pokemontcg.io API — English TCG card lookup (https://pokemontcg.io)


import { buildChainSets } from "./chains";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

// Unified rarity priority — lower index = better card
const RARITY_ORDER = [
  // IR/SIR pass
  "Special Illustration Rare",
  "Illustration Rare",
  // VGX pass (lower index = higher priority)
  "Hyper Rare",
  "Rare Secret",
  "Trainer Gallery Rare Holo",
  "Ultra Rare",
  "Rare Ultra",
  "Rare Holo V",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo GX",
  "Rare Holo EX",
];

export const IR_RARITIES = new Set(["Special Illustration Rare", "Illustration Rare"]);
export const VGX_RARITIES = new Set([
  "Hyper Rare",
  "Rare Secret",
  "Trainer Gallery Rare Holo",
  "Ultra Rare",
  "Rare Ultra",
  "Rare Holo V",
  "Rare Holo VSTAR",
  "Rare Holo VMAX",
  "Rare Holo GX",
  "Rare Holo EX",
]);

// Trainer Gallery card number pattern — TG01, TG08, TG19, etc.
const TG_RE = /^TG\d+$/;

const REGIONAL_RE = /^(alolan|galarian|hisuian|paldean)\s/i;
const TRAINER_OWNED_RE = /['']\s*s\s+/i;
const MAIN_GIMMICK_RE = /\b(VMAX|VSTAR|V-UNION)\b/i;

// SVP promos that are non-full-art stamp reprints — excluded from promo pass
// 59 (Xatu) and 89 (Feraligatr) visibly reuse a mainline set's bordered design
// (Paradox Rift / Temporal Forces logos baked into the art) — bordered reprints, not full-art.
// 22 (Pelipper) confirmed the same way — bordered "Paldea Evolved" design showing through.
// 110 (Darkrai), 180 (Dialga), 17 (Lucario): confirmed not full art despite the "ex" name
// suffix that normally signals a full-art promo — plain bordered "ex" cards.
// 7 (Hawlucha): confirmed bordered "Scarlet & Violet" reprint despite having an ability.
const SVP_BLACKLIST = new Set(["11", "17", "22", "24", "59", "89", "110", "122", "167", "168", "169", "180", "7"]);

// Plain-named SVP promos confirmed to be genuine full art despite having neither an ability
// nor an ex/V/GX suffix — the two signals promoSvPick normally requires. 52 (Mewtwo, "Reflective
// Barrier"/"Psyslash") is a full-bleed cityscape illustration, not a plain stamp reprint.
const SVP_ALLOWLIST = new Set(["52"]);

// Trainer-owned cards confirmed to be worse than the Pokémon's own plain promo/card despite
// ranking higher by rarity tier — e.g. sv10-231 "Team Rocket's Mewtwo ex" (Special Illustration
// Rare, $554) outranks svp-52 "Mewtwo" ($49) by tier, but the user prefers the plain promo here.
// Unlike Kyogre/Beldum (where the trainer-owned card was the only good option), Mewtwo already
// has a solid plain alternative, so this is a per-card exception, not a rule reversal.
// svp-184 "Hop's Snorlax" ($20.09) similarly outranks svp-51 "Snorlax" ($22.79) by set/number
// tiebreak despite the user preferring the plain promo.
const TRAINER_CARD_BLACKLIST = new Set(["sv10-231", "svp-184"]);

// Early SWSH sets (Shining Fates and below) — Rare Ultra V cards from these are not alt arts
const SWSH_EARLY_SETS = new Set(["swsh1", "swsh2", "swsh3", "swsh35", "swsh4", "swsh45"]);

// Full-art V/VSTAR/VMAX cards confirmed (via API artist field) to be a genuinely different
// illustration from their bordered "Rare Holo V"-tier sibling, not an extended reprint —
// e.g. swsh9-159 "Granbull V" (artist Ayaka Yoshida) vs its bordered swsh9-57 sibling (artist
// PLANETA Mochizuki). Excluding these lets the bordered sibling win on its own tier instead of
// permanently overriding with a hardcode — a genuinely better future card can still compete.
// sm10-193 (Venomoth GX full art) shares its artist with the bordered sm10-12 sibling,
// which normally signals a safe extended illustration — but confirmed by direct user
// feedback to look wrong in this specific card template, so it's excluded anyway.
// xy5-153 (Aggron-EX, Rare Ultra, $40) outranks Aggron V (swsh9-96, $1.01) by rarity tier,
// but confirmed by direct user feedback that the V card is the one wanted here.
// sm4-102 (Alolan Golem-GX full art) shares its artist with the bordered sm4-34 sibling
// (both "5ban Graphics"), which normally signals a safe extended illustration — but confirmed
// by direct user feedback to look wrong in this specific card template.
// bw5-107 (Darkrai-EX), xy4-122 (Dialga-EX), xy3-107 (Lucario-EX): confirmed via direct
// feedback to show a visible border when used as a background — NOT a general BW/XY-era issue
// (other BW/XY Rare Ultra EX cards look fine), just these three specific prints.
// swsh1-53 "Keldeo V": confirmed via direct feedback to look wrong stretched as a background
// for base (Ordinary Forme) Keldeo specifically (it's hardcoded full-bleed for Resolute Forme
// Keldeo instead, via HARDCODED_FORM_URLS).
// swsh10tg-TG16/19/20 "Galarian Articuno/Zapdos/Moltres V" (Trainer Gallery): the TG-number
// check in effectiveScore below forces these to "Trainer Gallery Rare Holo" tier regardless of
// actual rarity, which always beat the much higher-value plain "Rare Ultra V" printings
// (swsh6-170/174/177, confirmed genuinely pricier) for these three specific birds.
// sm2-136 "Toxapex-GX", sm1-138 "Lurantis-GX", sm2-141 "Kommo-o-GX", sm4-103 "Nihilego-GX",
// sm4-106 "Kartana-GX", swsh5-149 "Necrozma", sm7-159 "Stakataka-GX", swsh7-178 "Dracozolt",
// swsh7-176 "Arctovish": confirmed bordered/non-full-art despite picking as the winning
// candidate — visible card frame bleeding through as a background.
// me2-100/sv10-201: not a border issue — these are genuinely full-art Zacian/Zamazenta cards,
// but user-confirmed they depict the Crowned Sword/Shield forms specifically and were wrongly
// winning as the base (Hero of Many Battles) entity's card. Moved to HARDCODED_FORM_URLS for
// the Crowned forms instead; blacklisted here so the base entity's automated pass (IR/SIR in
// particular — this list is checked there too, not just VGX) doesn't just re-select them.
// sm5-145 "Dusk Mane Necrozma-GX", sm5-143 "Dawn Wings Necrozma-GX": confirmed via direct image
// inspection to be a boxed/bordered layout (plain background box + separate text panel below),
// not full art — despite sharing an artist with a bordered sibling (the usual safe-extension
// signal). sm6-95 "Ultra Necrozma-GX" is a genuine full-bleed illustration and is NOT blacklisted.
// swsh11-172 "Hisuian Electrode V": technically full-bleed (no box), but the character only
// fills the top ~60% of the card, so the attack-text panel below bleeds into the visible crop
// window — confirmed via direct image inspection. Lets the curated SWSH294 regional promo
// (see fetchRegionalPromoPriority) win instead, as originally intended.
const MISMATCHED_FULL_ART_BLACKLIST = new Set(["swsh9-159", "swsh10-169", "sm10-193", "xy5-153", "sm4-102", "bw5-107", "xy4-122", "xy3-107", "swsh1-53", "swsh10tg-TG16", "swsh10tg-TG19", "swsh10tg-TG20", "sm2-136", "sm1-138", "sm2-141", "sm4-103", "sm4-106", "swsh5-149", "sm7-159", "swsh7-178", "swsh7-176", "me2-100", "sv10-201", "sm5-145", "sm5-143", "swsh11-172"]);

// Shiny vault cards use SV-prefixed numbers (SV086, SV1/SV94, etc.); newer sets use "Shiny*" rarities.
function isShinyCard(c: PtcgCard): boolean {
  return (c.rarity ?? "").startsWith("Shiny") || /^SV\d/i.test(c.number);
}

// WotC-era Gen 1 sets: Base, Jungle, Fossil, Team Rocket, Gym, Neo, e-Card (Expedition/Aquapolis/Skyridge)
function isGenOneEraSet(setId: string): boolean {
  return /^(base|gym|neo)\d/i.test(setId);
}

interface PtcgCard {
  id: string;
  number: string;
  name: string;
  rarity: string;
  subtypes: string[];
  artist?: string;
  abilities?: unknown[];
  set: { id: string };
  images: { small: string; large: string | null };
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null }> };
}

export interface RankedCard extends PtcgCard { _rarity: string }

export interface TcgImageResult { tcgUrl: string | null; isOldStyle?: boolean }

const NAME_OVERRIDES: Record<string, string> = {
  "nidoran-f": "Nidoran ♀",
  "nidoran-m": "Nidoran ♂",
  "mr-mime":   "Mr. Mime",
  "farfetchd": "Farfetch'd",
  "ho-oh":     "Ho-Oh",
  // PokeAPI's default list entry for Deoxys is "deoxys-normal" (its base form is not
  // just "deoxys" like other multi-form species), which doesn't match any card name.
  "deoxys-normal": "Deoxys",
  // Same issue for other species whose default list entry carries a forme suffix.
  "wormadam-plant":  "Wormadam",
  "giratina-altered": "Giratina",
  "shaymin-land":    "Shaymin",
  "mime-jr":         "Mime Jr.",
  "basculin-red-striped": "Basculin",
  "darmanitan-standard":  "Darmanitan",
  "frillish-male":        "Frillish",
  "jellicent-male":       "Jellicent",
  "tornadus-incarnate":   "Tornadus",
  "thundurus-incarnate":  "Thundurus",
  "landorus-incarnate":   "Landorus",
  "keldeo-ordinary":      "Keldeo",
  "meloetta-aria":        "Meloetta",
  "pyroar-male":          "Pyroar",
  "flabebe":              "Flabébé",
  "meowstic-male":        "Meowstic",
  "aegislash-shield":     "Aegislash",
  "pumpkaboo-average":    "Pumpkaboo",
  "gourgeist-average":    "Gourgeist",
  "zygarde-50":           "Zygarde",
  "oricorio-baile":            "Oricorio",
  "lycanroc-midday":           "Lycanroc",
  "wishiwashi-solo":           "Wishiwashi",
  "type-null":                 "Type: Null",
  "minior-red-meteor":         "Minior",
  "mimikyu-disguised":         "Mimikyu",
  "toxtricity-amped":          "Toxtricity",
  "tapu-koko": "Tapu Koko",
  "tapu-lele": "Tapu Lele",
  "tapu-bulu": "Tapu Bulu",
  "tapu-fini": "Tapu Fini",
  // These four Galar-region evolutions are exclusively regional forms with no "base" species —
  // the TCG only ever prints them as "Galarian X", never plain "X".
  "obstagoon":                 "Galarian Obstagoon",
  "perrserker":                "Galarian Perrserker",
  "cursola":                   "Galarian Cursola",
  "sirfetchd":                 "Galarian Sirfetch'd",
  "mr-rime":                   "Galarian Mr. Rime",
  "runerigus":                 "Galarian Runerigus",
  "eiscue-ice":                "Eiscue",
  "indeedee-male":             "Indeedee",
  "morpeko-full-belly":        "Morpeko",
  "urshifu-single-strike":     "Single Strike Urshifu",
  "basculegion-male":          "Hisuian Basculegion",
  "sneasler":                  "Hisuian Sneasler",
  "overqwil":                  "Hisuian Overqwil",
  "enamorus-incarnate":        "Enamorus",
  "oinkologne-male":           "Oinkologne",
  "maushold-family-of-four":   "Maushold",
  "squawkabilly-green-plumage": "Squawkabilly",
  "palafin-zero":              "Palafin",
  "tatsugiri-curly":           "Tatsugiri",
  // Clodsire, like Obstagoon/Perrserker above, is exclusively a Paldean regional evolution.
  "clodsire":                  "Paldean Clodsire",
  "dudunsparce-two-segment":   "Dudunsparce",
  "great-tusk":     "Great Tusk",
  "scream-tail":    "Scream Tail",
  "brute-bonnet":   "Brute Bonnet",
  "flutter-mane":   "Flutter Mane",
  "slither-wing":   "Slither Wing",
  "sandy-shocks":   "Sandy Shocks",
  "iron-treads":    "Iron Treads",
  "iron-bundle":    "Iron Bundle",
  "iron-hands":     "Iron Hands",
  "iron-jugulis":   "Iron Jugulis",
  "iron-moth":      "Iron Moth",
  "iron-thorns":    "Iron Thorns",
  "roaring-moon":   "Roaring Moon",
  "iron-valiant":   "Iron Valiant",
  "walking-wake":   "Walking Wake",
  "iron-leaves":    "Iron Leaves",
  "raging-bolt":    "Raging Bolt",
  // Indigo Disk DLC Paradox Pokémon — missed in the original batch above, causing toDisplayName's
  // fallback (which only capitalizes the first letter, leaving "gouging-fire" as "Gouging-fire")
  // to never match real card names at all.
  "gouging-fire":   "Gouging Fire",
  "iron-boulder":   "Iron Boulder",
  "iron-crown":     "Iron Crown",
  // Ogerpon's default variety (Teal Mask) is the only one PokeAPI marks default; its other
  // masks are real distinct alt forms (see BASE_SLUG_OVERRIDES/parseFormSlug in lib/pokeapi.ts).
  "ogerpon":        "Teal Mask Ogerpon",
};

export function toDisplayName(slug: string): string {
  return NAME_OVERRIDES[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

// Opaque data types returned by index builders — passed to sync lookup functions.
export interface IrSirData { rarities: string[]; indexes: Map<string, PtcgCard[]>[] }
export interface PromoSvData { index: Map<string, PtcgCard[]> }
export interface VgxData { rarities: string[]; indexes: Map<string, PtcgCard[]>[] }
export interface FallbackArtData { rarities: readonly string[]; indexes: Map<string, PtcgCard[]>[] }

function cardImageUrl(card: PtcgCard): string {
  return card.images.large ?? card.images.small;
}

function rarityScore(rarity: string): number {
  const idx = RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

// Card names with these trailing words are forme-specific variants (e.g. Castform's "Castform
// Sunny Form"), not a generic mechanic suffix like "ex"/"V"/"GX" — a bare species-name query
// must not match them, or the base Pokémon picks up a card meant for one of its alt forms.
const FORME_VARIANT_SUFFIX_RE = /\s+(Sunny|Rainy|Rain|Snowy|Snow-Cloud)\s+Forme?$|\s+(Plant|Sandy|Trash)\s+Cloak$/i;

function nameMatches(cardName: string, query: string): boolean {
  const cn = cardName.toLowerCase();
  const q  = query.toLowerCase();
  if (cn.startsWith(q + " ") && FORME_VARIANT_SUFFIX_RE.test(cardName.slice(query.length))) return false;
  return cn === q || cn.startsWith(q + " ") || cn === q + "-gx" || cn === q + "-ex" || cn.includes("& " + q);
}

// Fetch ALL cards matching a query, handling pagination automatically.
// Instead of one request per Pokémon, callers fetch an entire rarity at once
// and look up by name client-side — far fewer total requests.
async function fetchAllPages(q: string, noCache = false): Promise<PtcgCard[]> {
  const results: PtcgCard[] = [];
  let page = 1;
  let totalCount: number | null = null;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,subtypes,artist,abilities,set,images,tcgplayer`;
    let data: PtcgCard[] | null = null;
    // 5 attempts with longer backoff — wide rarity-index fetches span many pages, and silently
    // giving up early on a transient failure truncates the index without any signal, which was
    // causing intermittent wrong picks (e.g. Alolan Golem-GX flipping between regen runs
    // depending on whether the page containing the winning card happened to load that run).
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
        const res = await fetch(url, {
          headers: getHeaders(),
          ...(noCache ? { cache: "no-store" } : { next: { revalidate: 86400 } }),
        });
        if (res.status === 429 && attempt < 4) continue;
        if (!res.ok) throw new Error(`pokemontcg.io ${res.status} for ${q}`);
        const json = await res.json();
        data = json.data ?? [];
        if (typeof json.totalCount === "number") totalCount = json.totalCount;
        break;
      } catch {
        if (attempt === 4) {
          // Previously this returned early and silently truncated every page after this one —
          // e.g. a transient failure on page 15 of a 30-page "Illustration Rare" scan would drop
          // every newer-set card from page 16 onward, with cards from later-added sets (like the
          // "me*" Mega Evolution sets) disappearing from the index despite existing. Skipping just
          // the failed page and continuing keeps the rest of the index intact; we still know when
          // to stop via totalCount from an earlier successful page rather than this page's (empty)
          // result length.
          process.stderr.write(`[fetchAllPages] giving up on page ${page} for query "${q}" after 5 attempts — this page's results will be missing\n`);
          data = null;
        }
      }
    }
    if (data) results.push(...data);
    const fetchedPages = page;
    const knownLastPage = totalCount !== null ? Math.ceil(totalCount / 250) : null;
    if (knownLastPage !== null) {
      if (fetchedPages >= knownLastPage) break;
    } else if (data !== null && data.length < 250) {
      break;
    } else if (data === null && totalCount === null) {
      // Failed on page 1 with no totalCount to know how far to go — nothing more we can do.
      break;
    }
    page++;
  }
  return results;
}

// Build a name→cards index from a bulk rarity fetch.
// Keys are lowercased card names for fast lookup.
function buildNameIndex(cards: PtcgCard[]): Map<string, PtcgCard[]> {
  const index = new Map<string, PtcgCard[]>();
  for (const card of cards) {
    const key = card.name.toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push(card);
    else index.set(key, [card]);
  }
  return index;
}

// Look up candidates for a Pokémon from a pre-built name index.
// Matches exact name or "name <suffix>" (e.g. "Charizard ex", "Charizard V").
function lookupCandidates(
  index: Map<string, PtcgCard[]>,
  displayName: string,
  rarity: string,
  { allowTrainerOwned = false, allowGimmick = false, skipRegionalFilter = false, allowRegionalFallback = false }: {
    allowTrainerOwned?: boolean;
    allowGimmick?: boolean;
    skipRegionalFilter?: boolean;
    allowRegionalFallback?: boolean;
  } = {},
): RankedCard[] {
  const nameLower = displayName.toLowerCase();
  // If the query itself already names a regional form ("Galarian Rapidash"), match it like
  // any other exact name — the fuzzy "base name inside a regional key" path below is only for
  // when the query is a plain base name (e.g. "Rapidash") being fuzzy-matched against a
  // regional-prefixed card ("Galarian Rapidash V"). Without this, a query that already
  // includes the prefix never matches its own card: "galarian rapidash v" doesn't contain
  // " galarian rapidash " (the prefix has no leading space to find).
  const queryIsRegional = REGIONAL_RE.test(nameLower);
  const matched: RankedCard[] = [];
  const regionalMatched: RankedCard[] = [];
  for (const [key, cards] of index) {
    const isRegionalKey = !queryIsRegional && REGIONAL_RE.test(key);
    // For regional keys (e.g. "alolan persian-gx"), check if the base name is contained
    const keyMatches = isRegionalKey
      ? (key.includes(" " + nameLower + "-") || key.includes(" " + nameLower + " ") || key.endsWith(" " + nameLower))
      : nameMatches(key, nameLower);
    if (!keyMatches) continue;
    for (const c of cards) {
      if (
        c.images?.large &&
        (allowTrainerOwned || !TRAINER_OWNED_RE.test(c.name)) &&
        (allowGimmick      || !MAIN_GIMMICK_RE.test(c.name))
      ) {
        if (skipRegionalFilter || !isRegionalKey) matched.push({ ...c, _rarity: rarity });
        else if (allowRegionalFallback && /^alolan /i.test(c.name)) regionalMatched.push({ ...c, _rarity: rarity });
      }
    }
  }
  // Use regional cards only if no non-regional candidates found
  return matched.length ? matched : regionalMatched;
}

// Returns true for sets older than BW era (DP, Platinum, HGSS, EX series, Base, Neo, etc.)
// BW introduced full-bleed artwork so bw+ sets look fine as card backgrounds.
function isPreBwSet(setId: string): boolean {
  return !/^(bw|xy|sm|swsh|sv)/i.test(setId);
}

function pickBestCard(cards: RankedCard[]): RankedCard | null {
  if (!cards.length) return null;
  const effectiveScore = (c: RankedCard) => {
    // TG-numbered cards (Trainer Gallery) are always full-art, but pokemontcg.io's `rarity`
    // field for them is inconsistent — e.g. swsh10tg-TG13 "Starmie V" is tagged "Rare Holo V"
    // rather than "Trainer Gallery Rare Holo", so it lost to a same-set Rare Ultra by tier
    // despite being the rarer, more valuable Trainer Gallery print. Number pattern is reliable
    // where the rarity field isn't.
    if (TG_RE.test(c.number)) return rarityScore("Trainer Gallery Rare Holo");
    return rarityScore(c._rarity);
  };
  return cards.reduce((a, b) => {
    const ra = effectiveScore(a), rb = effectiveScore(b);
    if (ra !== rb) return ra < rb ? a : b;
    // Same rarity tier: prefer higher market price (catches TG vs Ultra Rare, etc.)
    const pa = marketPrice(a), pb = marketPrice(b);
    if (pa !== pb) return pb > pa ? b : a;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    const aNum = parseInt(a.number) || 0, bNum = parseInt(b.number) || 0;
    return bNum >= aNum ? b : a;
  });
}

function pickBest(cards: RankedCard[]): string | null {
  const winner = pickBestCard(cards);
  return winner ? cardImageUrl(winner) : null;
}

function pickBestWithChain(cards: RankedCard[], chainSets: Set<string> | undefined): string | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    // TG cards are always eligible — don't filter them by chain set
    const chainCards = cards.filter(c => chainSets.has(c.set.id) || TG_RE.test(c.number));
    if (chainCards.length) return pickBest(chainCards);
  }
  return pickBest(cards);
}

function pickBestCardWithChain(cards: RankedCard[], chainSets: Set<string> | undefined): RankedCard | null {
  if (!cards.length) return null;
  if (chainSets?.size) {
    const chainCards = cards.filter(c => chainSets.has(c.set.id) || TG_RE.test(c.number));
    if (chainCards.length) return pickBestCard(chainCards);
  }
  return pickBestCard(cards);
}

// Fetch all cards of a given rarity (non-Tera) and return a name index.
async function fetchRarityIndex(rarity: string, allowTeraEx = false, excludeMeSets = false, onlyTera = false): Promise<Map<string, PtcgCard[]>> {
  const teraFilter = onlyTera ? " subtypes:Tera" : (allowTeraEx ? "" : " -subtypes:Tera");
  const meFilter = excludeMeSets ? " -set.id:me*" : "";
  const cards = await fetchAllPages(`rarity:"${rarity}"${teraFilter}${meFilter}`);
  return buildNameIndex(cards);
}

interface FetchOptions {
  allowTrainerOwned?: boolean;
  allowGimmick?: boolean;
  skipRegionalFilter?: boolean;
  allowTeraEx?: boolean;
}

// --- Index builders (async, one network call per rarity) ---

export async function buildIrSirData(): Promise<IrSirData> {
  const rarities = RARITY_ORDER.filter(r => IR_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r)));
  return { rarities, indexes };
}

// Tera-type IR/SIR cards, kept as a separate lower-priority tier rather than blended into the
// main IR/SIR index — a Tera reprint of an otherwise-ordinary Pokémon shouldn't outrank a
// genuine full-art illustration the way it would if included in the primary tier, but it's
// still worth showing if nothing else (VGX, Ancient Trait) has already claimed a background.
export async function buildTeraIrSirData(): Promise<IrSirData> {
  const rarities = RARITY_ORDER.filter(r => IR_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r, false, false, true)));
  return { rarities, indexes };
}

// --- Sync lookup functions (use pre-built index data) ---

export function irSirCandidates(data: IrSirData, displayName: string): RankedCard[] {
  const nameLower = displayName.toLowerCase();
  return data.rarities.flatMap((r, i) => {
    const cands = lookupCandidates(data.indexes[i], displayName, r).filter(c => !MISMATCHED_FULL_ART_BLACKLIST.has(c.id));
    // For IR (not SIR): exclude SV-era "Pokémon ex" cards — distinct identities from the base form
    return r === "Illustration Rare" ? cands.filter(c => c.name.toLowerCase() !== nameLower + " ex") : cands;
  });
}

export function irSirPick(candidates: RankedCard[], chainSets?: Set<string>): TcgImageResult | null {
  const url = pickBestWithChain(candidates, chainSets);
  return url ? { tcgUrl: url } : null;
}

export function trainerIrPick(data: IrSirData, displayName: string): string | null {
  const nameLower = displayName.toLowerCase();
  const candidates: RankedCard[] = [];
  for (let i = 0; i < data.rarities.length; i++) {
    for (const [key, cards] of data.indexes[i]) {
      if (!TRAINER_OWNED_RE.test(key) || !key.includes(nameLower)) continue;
      for (const c of cards) {
        if (c.images?.large && !TRAINER_CARD_BLACKLIST.has(c.id)) candidates.push({ ...c, _rarity: data.rarities[i] });
      }
    }
  }
  return pickBest(candidates);
}

// Trainer-owned cards outside the SVP promo set (e.g. "Team Aqua's Kyogre-EX" from the
// Double Crisis half-deck set) — mirrors trainerIrPick/trainerPromoPick but against the
// shared VGX dataset, which spans all sets rather than one curated subset.
export function trainerVgxPick(data: VgxData, displayName: string): string | null {
  const nameLower = displayName.toLowerCase();
  const candidates: RankedCard[] = [];
  for (let i = 0; i < data.rarities.length; i++) {
    for (const [key, cards] of data.indexes[i]) {
      if (!TRAINER_OWNED_RE.test(key) || !key.includes(nameLower)) continue;
      for (const c of cards) {
        if (c.images?.large && !TRAINER_CARD_BLACKLIST.has(c.id)) candidates.push({ ...c, _rarity: data.rarities[i] });
      }
    }
  }
  return pickBest(candidates);
}

// SV-era full-art promo set IDs — add new promo sets here as they release
// mep/mepen excluded: those sets contain standard bordered cards for common Pokémon
// (no blacklist like SVP_BLACKLIST exists for them, causing non-full-art backgrounds)
const SV_PROMO_SETS = ["svp"];

async function imageExists(url: string): Promise<boolean> {
  // Retries, like fetchAllPages — a single transient network failure here was silently
  // making promoSvPick return null (e.g. Mewtwo/Snorlax intermittently falling back to a
  // worse pick), since the winning candidate's image never got a second chance to verify.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt));
      const res = await fetch(url, { method: "HEAD", next: { revalidate: 86400 } });
      return res.ok;
    } catch { if (attempt === 2) return false; }
  }
  return false;
}

export async function buildPromoSvData(): Promise<PromoSvData> {
  const perSetCards = await Promise.all(
    SV_PROMO_SETS.map(setId => fetchAllPages(`set.id:${setId} -subtypes:Tera`))
  );
  perSetCards.forEach((cards, i) => { if (cards.length > 0) process.stderr.write(`[promo fetch] set=${SV_PROMO_SETS[i]} count=${cards.length}\n`); });
  return { index: buildNameIndex(perSetCards.flat()) };
}

// promoSvPick is async so it can verify the winner's image URL before returning it.
// Some pokemontcg.io API entries have images.large set but the actual CDN file is missing;
// verifying only the single winner (not all candidates) keeps this check cheap.
// Plain Pokémon names in SVP fall into two groups: unique SVP-only illustrated prints with
// their own ability text (Noctowl "Jewel Seeker", Snorlax "Voraciousness", Xatu "Clairvoyant
// Sense") worth showing full-bleed, and plain stamp reprints with generic two-attack, no-ability
// text (Mareep, Flaaffy — confirmed via API: abilities: null) that don't. Requiring an ability
// is a reliable signal since real API data shows it lines up with both confirmed groups.
export async function promoSvPick(data: PromoSvData, displayName: string): Promise<string | null> {
  // Scan every index key rather than an exact Map.get(displayName) — suffixed promos like
  // "Kingdra ex" are indexed under their full card name ("kingdra ex"), so an exact lookup for
  // "kingdra" always misses even though nameMatches() below would correctly match it.
  // Skip the REGIONAL_RE exclusion when the query itself already names a regional form (e.g.
  // "Hisuian Overqwil") — otherwise a region-exclusive species with no non-regional form to
  // protect against gets every one of its real cards excluded.
  const queryIsRegional = REGIONAL_RE.test(displayName);
  const candidates = [...data.index.values()].flat().filter(c =>
    c.images?.large && !SVP_BLACKLIST.has(c.number) && nameMatches(c.name, displayName) &&
    (queryIsRegional || !REGIONAL_RE.test(c.name)) && !TRAINER_OWNED_RE.test(c.name) &&
    (SVP_ALLOWLIST.has(c.number) || c.abilities?.length || /\s+(ex|V|GX|EX|VMAX|VSTAR|V-UNION)$/.test(c.name))
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const ra = rarityScore(a.rarity), rb = rarityScore(b.rarity);
    if (ra !== rb) return ra < rb ? a : b;
    return parseInt(b.number) > parseInt(a.number) ? b : a;
  });
  const url = cardImageUrl(best);
  return (await imageExists(url)) ? url : null;
}

// promoSvPick excludes trainer-owned names (e.g. "Steven's Beldum") since most Pokémon's own
// promoSvPick search shouldn't surface someone else's card. This pass specifically finds them —
// mirrors trainerIrPick but against the SVP promo dataset instead of the IR/SIR dataset.
export async function trainerPromoPick(data: PromoSvData, displayName: string): Promise<string | null> {
  const nameLower = displayName.toLowerCase();
  const candidates: PtcgCard[] = [];
  for (const [key, cards] of data.index) {
    if (!TRAINER_OWNED_RE.test(key) || !key.includes(nameLower)) continue;
    for (const c of cards) {
      if (c.images?.large && !SVP_BLACKLIST.has(c.number) && !TRAINER_CARD_BLACKLIST.has(c.id)) candidates.push(c);
    }
  }
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const ra = rarityScore(a.rarity), rb = rarityScore(b.rarity);
    if (ra !== rb) return ra < rb ? a : b;
    return parseInt(b.number) > parseInt(a.number) ? b : a;
  });
  const url = cardImageUrl(best);
  return (await imageExists(url)) ? url : null;
}

export async function buildVgxData(): Promise<VgxData> {
  const rarities = RARITY_ORDER.filter(r => VGX_RARITIES.has(r));
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r, false, true)));
  return { rarities, indexes };
}

const OLD_STYLE_RARITIES = new Set(["Rare Holo EX", "Rare Secret", "Rare Ultra"]);

export function vgxCandidates(data: VgxData, displayName: string): RankedCard[] {
  const nameLower = displayName.toLowerCase();
  const all = data.rarities.flatMap((r, i) =>
    lookupCandidates(data.indexes[i], displayName, r, { allowGimmick: true })
  );
  // Single-Pokémon "-GX" full arts: allow through only if they share an illustrator with a
  // bordered "Rare Holo GX" sibling here (same illustration extended, e.g. Vileplume-GX's
  // sm12-211) — otherwise it's a genuinely different, often plain swirl-background
  // illustration (e.g. Persian-GX, Golem-GX) that reads poorly full-bleed.
  const borderedGxArtists = new Set(
    all.filter(c => c._rarity === "Rare Holo GX" && c.artist).map(c => c.artist)
  );
  return all.filter(c => {
    if (c.name.toLowerCase() === nameLower + " ex") return false;
    if (MISMATCHED_FULL_ART_BLACKLIST.has(c.id)) return false;
    // SWSH "Rare Secret" cards are solid-gold shinies (e.g. swsh8 Flaaffy 280,
    // swsh9 Galarian birds 181-183) — not alt-art illustrations, despite being newer than
    // XY. BW-era and older Rare Secrets (e.g. bw6-128 "Rayquaza", ex9-107 Farfetch'd) are
    // the same deal: shiny recolors/gold-star treatments of the standard bordered
    // illustration, not full art. Only xy/sm/sv-era Rare Secrets are genuine full arts —
    // everything else (swsh, bw, and all older eras: ex/neo/ecard/dp/pl/hgss/col/base/gym/
    // pop/dv) is excluded.
    if (c._rarity === "Rare Secret" && !/^(xy|sm|sv)/i.test(c.set.id) && !TG_RE.test(c.number)) return false;
    if (!["Rare Ultra", "Rare Secret", "Hyper Rare", "Rare Holo VMAX"].includes(c._rarity)) return true;
    if (c.name.endsWith("-GX") && !c.name.includes(" & ")
      && !(c.artist && borderedGxArtists.has(c.artist))) return false;
    if (/ V(-UNION)?$/.test(c.name) && SWSH_EARLY_SETS.has(c.set.id)) return false;
    if (/ V(-UNION)?$/.test(c.name) && c._rarity === "Hyper Rare") return false;
    if (/ VMAX$/.test(c.name)) return false;
    return true;
  });
}

export function vgxPick(candidates: RankedCard[], chainSets?: Set<string>): TcgImageResult | null {
  if (!candidates.length) return null;
  const isOldStyle = (c: RankedCard) => OLD_STYLE_RARITIES.has(c._rarity) && isPreBwSet(c.set.id);
  // Modern full-art cards (GX, V, TAG TEAM etc.) don't need chain set coherence
  const modern = candidates.filter(c => !isOldStyle(c));
  const winner = modern.length
    ? pickBestCard(modern)
    : pickBestCardWithChain(candidates, chainSets);
  if (!winner) return null;
  return { tcgUrl: cardImageUrl(winner), isOldStyle: isOldStyle(winner) };
}

// Chain reconciliation: find the best card for a Pokémon within allowed sets.
export async function fetchTcgFromChainSet(
  pokemon: Array<{ id: number; name: string }>,
  requiredSets: Map<number, Set<string>>,
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();
  const rarities = RARITY_ORDER;
  const indexes = await Promise.all(rarities.map(r => fetchRarityIndex(r, true)));

  const entries = pokemon.map(({ id, name }) => {
    const displayName = toDisplayName(name);
    const allowed = requiredSets.get(id);
    if (!allowed?.size) return null;
    const candidates = rarities.flatMap((r, i) =>
      lookupCandidates(indexes[i], displayName, r, { allowGimmick: true })
        .filter(c => allowed.has(c.set.id))
    );
    const url = pickBest(candidates);
    return url ? [id, { tcgUrl: url }] as const : null;
  });
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}

// Alt-form card lookup — IR → TG (regional) → VGX, with Mega name fallbacks.
// Alt forms are looked up individually (low volume, varied names).
// Promos (swshp/smp/xyp) are curated separately from the main VGX pool and take priority
// over it — a specific full-art promo shouldn't lose to some unrelated set's pricier Ultra
// Rare of the same Pokémon just because that set happens to price higher. Exported standalone
// so callers can check it even when a shared-index lookup already found a non-promo winner —
// otherwise a real (but less desirable) card short-circuits the promo check entirely.
const FULL_ART_PROMO_SETS = new Set(["swshp", "smp", "xyp"]);
// A handful of promo-set cards carry a mechanic suffix (V/GX/ex) but are still bordered,
// non-full-art prints — SWSH237 "Hisuian Typhlosion V" and SWSH111 "Galarian Rapidash V"
// are stamped bordered reprints (confirmed via API: different artist, promo-tier pricing
// far below their full-art siblings), unlike SWSH294 "Hisuian Electrode V" which is a
// genuine full-art. No API field distinguishes them, so exclude known cases by number.
// SWSH253-256 "Origin Forme Dialga/Palkia V/VSTAR": entire promo family is bordered (V and
// VSTAR subtypes alike), same design as their swsh10-177/167 mainline siblings — no genuine
// full art exists for these two Pokémon in this promo set (confirmed via direct API lookup).
// SWSH239 "Hisuian Samurott V", SWSH297 "Hisuian Zoroark V": user confirmed they actually want
// the Crown Zenith Galarian Gallery cards (swsh12pt5-GG51/GG56) for these two Hisuian alt forms
// instead — this promo-priority path was short-circuiting vgxPick's shared-index pick before it
// got a chance to win, regardless of any MISMATCHED_FULL_ART_BLACKLIST entry on the Gallery side.
const PROMO_BLACKLIST = new Set(["SWSH237", "SWSH111", "SWSH255", "SWSH253", "SWSH256", "SWSH254", "SWSH239", "SWSH297"]);

export async function fetchRegionalPromoPriority(displayName: string): Promise<string | null> {
  const allCards = await fetchAllPages(`name:"${displayName}"`);
  // Plain reprints in these promo sets have no suffix (e.g. "Alolan Sandslash"); genuine
  // full-art promos always carry one — hyphenated for GX ("Alolan Sandslash-GX"), spaced
  // for the rest ("Hisuian Electrode V").
  const promoCandidates = allCards
    .filter(c => c.images?.large && nameMatches(c.name, displayName)
      && c.rarity === "Promo" && FULL_ART_PROMO_SETS.has(c.set.id) && !PROMO_BLACKLIST.has(c.number)
      && /[\s-](ex|V|GX|EX|VMAX|VSTAR|V-UNION)$/.test(c.name))
    .map(c => ({ ...c, _rarity: "Trainer Gallery Rare Holo" }));
  return pickBest(promoCandidates);
}

export async function fetchFormCard(
  category: "mega" | "regional" | "gmax" | "primal" | "forme" | "other",
  _dexId: number,
  displayName: string,
  _formTypes: string[] = [],
  raritySet: Set<string> = VGX_RARITIES,
): Promise<TcgImageResult | null> {
  if (category === "other") return null;

  const rarities = RARITY_ORDER.filter(r => raritySet.has(r));
  const teraFilter = " -subtypes:Tera";
  const megaTeraFilter = ""; // mega ex cards in SV are Tera — allow them

  if (category === "regional") {
    if (raritySet === IR_RARITIES) {
      const cards = await fetchAllPages(`name:"${displayName}"${teraFilter}`);
      const candidates = cards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, displayName))
        .map(c => ({ ...c, _rarity: c.rarity }));
      const url = pickBest(candidates);
      return url ? { tcgUrl: url } : null;
    }
    const promoUrl = await fetchRegionalPromoPriority(displayName);
    if (promoUrl) return { tcgUrl: promoUrl };

    // VGX pass: gather all candidates including TG cards. Full-art tiers (TG, Ultra Rare,
    // Rare Ultra, Secret) carry no signal relative to each other — flatten them to one tier
    // so market price decides. Bordered tiers (Rare Holo V/VSTAR/VMAX) keep their lower rank
    // so a cheap bordered card can never out-price a full-art.
    const FULL_ART_TIERS = new Set(["Hyper Rare", "Rare Secret", "Trainer Gallery Rare Holo", "Ultra Rare", "Rare Ultra"]);
    const allCards = await fetchAllPages(`name:"${displayName}"`);
    // Single-Pokémon "-GX" full arts: allow through only if they share an illustrator with a
    // bordered "Rare Holo GX" sibling here (same illustration extended) — see vgxCandidates.
    const borderedGxArtists = new Set(
      allCards.filter(c => c.rarity === "Rare Holo GX" && c.artist).map(c => c.artist)
    );
    const candidates = allCards
      .filter(c => c.images?.large && nameMatches(c.name, displayName) && (TG_RE.test(c.number) || rarities.includes(c.rarity))
        && !MISMATCHED_FULL_ART_BLACKLIST.has(c.id)
        // Tera-subtype cards are excluded here too, mirroring buildVgxData's bulk index — they
        // compete in the dedicated Tera IR/SIR tier instead, so a merely-Ultra-Rare Tera card
        // can't outrank a genuine Special Illustration Rare Tera card sitting in that tier.
        && !c.subtypes?.includes("Tera")
        // TAG TEAM GX cards (name includes " & ") are always worth showing full-bleed.
        && !(c.name.endsWith("-GX") && !c.name.includes(" & ")
          && ["Rare Ultra", "Rare Secret", "Hyper Rare", "Rare Holo VMAX"].includes(c.rarity)
          && !(c.artist && borderedGxArtists.has(c.artist)))
        && !(c.rarity === "Hyper Rare" && / V(-UNION)?$/.test(c.name))
        // Only xy/sm/sv-era Rare Secrets are genuine full arts — swsh (solid-gold shinies,
        // e.g. swsh8 Flaaffy 280) and everything older (ex/neo/ecard/dp/pl/hgss/col/base/
        // gym/pop/dv, plus bw) are bordered gold-star cards instead.
        && !(c.rarity === "Rare Secret" && !/^(xy|sm|sv)/i.test(c.set.id) && !TG_RE.test(c.number)));
    const finalCandidates = candidates
      .map(c => ({
        ...c,
        _rarity: (TG_RE.test(c.number) || FULL_ART_TIERS.has(c.rarity))
          ? "Trainer Gallery Rare Holo" : (c.rarity ?? ""),
      }));
    const url = pickBest(finalCandidates);
    return url ? { tcgUrl: url } : null;
  }

  if (category === "gmax") {
    const baseName = displayName.replace(/^Gigantamax /, "").trim();
    const vmaxName = `${baseName} VMAX`;
    // Sets whose Rare Rainbow cards are alt-art illustrations worth showing
    const GMAX_RAINBOW_SETS = new Set(["swsh8"]);
    const cards = await fetchAllPages(`name:"${baseName}" subtypes:VMAX`);
    const candidates = cards
      .filter(c => c.images?.large && nameMatches(c.name, vmaxName) && !c.number.startsWith("SV") && c.set.id !== "swsh45sv" && c.rarity !== "Hyper Rare" && !(c.rarity === "Rare Rainbow" && !GMAX_RAINBOW_SETS.has(c.set.id)) && !(c.rarity === "Rare Secret" && /tg$/i.test(c.set.id)))
      .map(c => ({ ...c, _rarity: c.rarity ?? "Rare Holo VMAX" }));
    if (!candidates.length) return null;
    // Set tier: TG sets (0) > post-swsh45 numbered (1) > promos (2) > early sets (3)
    const gmaxTier = (id: string) =>
      /tg$/i.test(id) ? 0
      : /^swsh([5-9]|1\d)/i.test(id) ? 1
      : id === "swshp" ? 2
      : 3;
    const swshNum = (id: string) => { const m = id.match(/^swsh(\d+)/); return m ? parseInt(m[1]) : 0; };
    const winner = candidates.reduce((a, b) => {
      const ta = gmaxTier(a.set.id), tb = gmaxTier(b.set.id);
      if (ta !== tb) return ta < tb ? a : b;
      if (a.set.id !== b.set.id) {
        const na = swshNum(a.set.id), nb = swshNum(b.set.id);
        if (na !== nb) return nb > na ? b : a;
      }
      return (parseInt(b.number) || 0) >= (parseInt(a.number) || 0) ? b : a;
    });
    return { tcgUrl: cardImageUrl(winner) };
  }

  if (category === "mega") {
    const baseName = displayName.replace(/^Mega /, "").replace(/ [XY]$/, "").trim();
    const isXY = displayName.endsWith(" X") || displayName.endsWith(" Y");
    const namesToTry = isXY
      ? [`${displayName} ex`]
      : [`${displayName} ex`, `M ${baseName}-EX`, `Mega ${baseName} ex`, `Mega ${baseName}`];

    for (const queryName of namesToTry) {
      const cards = await fetchAllPages(`name:"${queryName}"${megaTeraFilter}`);
      const candidates = cards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, queryName))
        .map(c => ({ ...c, _rarity: c.rarity }));
      const url = pickBest(candidates);
      if (url) return { tcgUrl: url };
    }
    // Final fallback: query by MEGA subtype — catches "M Name-EX" cards where
    // the hyphen in quoted name queries confuses the Lucene parser.
    // Skip for IR pass (IR pass only wants SIR/IR which megas don't have).
    if (raritySet !== IR_RARITIES) {
      const xySuffix = isXY ? (displayName.endsWith(" X") ? " X" : " Y") : null;
      const subtypeCards = await fetchAllPages(`name:${baseName} subtypes:MEGA`);
      // Last resort: relax rarity/image filters — promo and old XY cards often lack images.large
      let subtypeCandidates = subtypeCards
        .filter(c => (c.images?.large || c.images?.small) && c.name.toLowerCase().includes(baseName.toLowerCase()))
        .map(c => ({ ...c, _rarity: RARITY_ORDER.includes(c.rarity) ? c.rarity : "Rare Holo EX" }));
      // For X/Y forms, prefer cards that include the variant suffix; fall back to all if none match
      if (xySuffix) {
        const xyMatches = subtypeCandidates.filter(c => c.name.includes(xySuffix));
        if (xyMatches.length) subtypeCandidates = xyMatches;
      }
      const url = pickBest(subtypeCandidates);
      return url ? { tcgUrl: url } : null;
    }
    return null;
  }

  if (category === "primal") {
    // Primal Kyogre/Groudon cards are named literally, e.g. "Primal Kyogre-EX" / "Primal Kyogre".
    const namesToTry = [`${displayName}-EX`, `${displayName} EX`, displayName];
    for (const queryName of namesToTry) {
      const cards = await fetchAllPages(`name:"${queryName}"`);
      const candidates = cards
        .filter(c => c.images?.large && rarities.includes(c.rarity) && nameMatches(c.name, queryName))
        .map(c => ({ ...c, _rarity: c.rarity }));
      const url = pickBest(candidates);
      if (url) return { tcgUrl: url };
    }
    return null;
  }

  return null;
}

// Last-resort rarity order — fallback when no price data is available (lower = better).
const LAST_RESORT_RARITY: Record<string, number> = {
  "Rare Holo": 0,
  "Rare": 1,
  "Uncommon": 2,
  "Common": 3,
};

function marketPrice(card: PtcgCard): number {
  const prices = card.tcgplayer?.prices;
  if (!prices) return 0;
  // Prefer market price, fall back to mid price when market is unavailable
  return Math.max(0, ...Object.values(prices).map(v => v?.market ?? v?.mid ?? 0));
}

function pickHighestValue(candidates: PtcgCard[]): PtcgCard {
  return candidates.reduce((a, b) => {
    const pa = marketPrice(a), pb = marketPrice(b);
    if (pa !== pb) return pb > pa ? b : a;
    const ra = LAST_RESORT_RARITY[a.rarity] ?? 4;
    const rb = LAST_RESORT_RARITY[b.rarity] ?? 4;
    if (ra !== rb) return ra < rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    return parseInt(b.number) > parseInt(a.number) ? b : a;
  });
}

// Pass 5: per-Pokémon name fetch for Pokémon with no card from any other pass.
// Picks the highest-rarity card available (any rarity), then newest set as tiebreaker.
// Last-resort lookup for alt forms by display name (already human-readable, no slug conversion needed).
export async function fetchFormCardLastResort(displayName: string): Promise<string | null> {
  const cards = await fetchAllPages(`name:"${displayName}"`);
  const candidates = cards.filter(c =>
    c.images?.large && nameMatches(c.name, displayName) && !isShinyCard(c) && !isGenOneEraSet(c.set.id)
  );
  if (!candidates.length) return null;
  return cardImageUrl(pickHighestValue(candidates));
}


export async function fetchTcgLastResort(
  pokemon: Array<{ id: number; name: string }>
): Promise<Map<number, TcgImageResult>> {
  if (!pokemon.length) return new Map();

  // Per-name search across all sets — picks the most valuable card by market price.
  // noCardPokemon is typically a small list so individual queries are acceptable.
  const results = await Promise.all(
    pokemon.map(async ({ id, name }, i) => {
      const displayName = toDisplayName(name);
      // Stagger requests to avoid simultaneous rate-limit hits
      await new Promise(r => setTimeout(r, i * 50));
      const cards = await fetchAllPages(`name:"${displayName}"`, true);
      // Skip the REGIONAL_RE exclusion when the query itself already names a regional form
      // (e.g. "Hisuian Overqwil") — otherwise a region-exclusive species with no non-regional
      // form to protect against gets every one of its real cards excluded (confirmed root
      // cause of Overqwil having no card at all despite real prints existing).
      const queryIsRegional = REGIONAL_RE.test(displayName);
      const candidates = cards.filter(c =>
        (c.images?.large || c.images?.small) &&
        nameMatches(c.name, displayName) &&
        (queryIsRegional || !REGIONAL_RE.test(c.name)) &&
        !TRAINER_OWNED_RE.test(c.name) &&
        !isShinyCard(c) &&
        !isGenOneEraSet(c.set.id)
      );
      if (!candidates.length) return null;
      return [id, { tcgUrl: cardImageUrl(pickHighestValue(candidates)) }] as const;
    })
  );
  return new Map(results.filter((r): r is NonNullable<typeof r> => r !== null));
}

// Rarities considered for the fallback crop card — ordered from rarest to most common.
// VGX Pokémon are already filtered out upstream, so V/VMAX/VSTAR won't appear here.
const FALLBACK_RARITIES = [
  "Rare Holo EX",
  "Rare Holo GX",
  "Rare Holo",
  "Rare Secret",
  "Rare Ultra",
] as const;

// XY Ancient Trait sets — Primal Clash, Roaring Skies, Ancient Origins
const ANCIENT_TRAIT_SETS = ["xy5", "xy6", "xy7"];

export interface AncientTraitData { index: Map<string, PtcgCard[]> }

export async function buildAncientTraitData(): Promise<AncientTraitData> {
  const perSetCards = await Promise.all(
    ANCIENT_TRAIT_SETS.map(setId => fetchAllPages(`ancientTrait.name:* set.id:${setId}`))
  );
  return { index: buildNameIndex(perSetCards.flat()) };
}

const AT_RARITY_SCORE: Record<string, number> = {
  "Rare Holo": 0,
  "Rare": 1,
  "Uncommon": 2,
  "Common": 3,
};

export function ancientTraitPick(data: AncientTraitData, displayName: string): string | null {
  // Skip the REGIONAL_RE exclusion when the query itself already names a regional form — see
  // the identical guard in promoSvPick/fetchTcgLastResort.
  const queryIsRegional = REGIONAL_RE.test(displayName);
  const candidates = (data.index.get(displayName.toLowerCase()) ?? []).filter(c =>
    c.images?.large && nameMatches(c.name, displayName) && (queryIsRegional || !REGIONAL_RE.test(c.name)) && !TRAINER_OWNED_RE.test(c.name)
  );
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => {
    const ra = AT_RARITY_SCORE[a.rarity ?? ""] ?? 4;
    const rb = AT_RARITY_SCORE[b.rarity ?? ""] ?? 4;
    if (ra !== rb) return ra <= rb ? a : b;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    return (parseInt(b.number) || 0) >= (parseInt(a.number) || 0) ? b : a;
  });
  return cardImageUrl(best);
}

export async function buildFallbackArtData(): Promise<FallbackArtData> {
  const indexes = await Promise.all(FALLBACK_RARITIES.map(r => fetchRarityIndex(r)));
  return { rarities: FALLBACK_RARITIES, indexes };
}

export function fallbackArtPick(data: FallbackArtData, displayName: string): string | null {
  const candidates: RankedCard[] = (data.rarities as string[]).flatMap((r, i) =>
    lookupCandidates(data.indexes[i], displayName, r, { allowGimmick: true })
  ).filter(c => !isShinyCard(c) && !isGenOneEraSet(c.set.id));
  if (!candidates.length) return null;
  // Rarity tier first (EX > GX > Holo > Secret > Ultra), then price, then newest set
  const rarityIndex = (c: RankedCard) => (data.rarities as string[]).indexOf(c._rarity);
  const best = candidates.reduce((a, b) => {
    const ra = rarityIndex(a), rb = rarityIndex(b);
    if (ra !== rb) return ra < rb ? a : b;
    const pa = marketPrice(a), pb = marketPrice(b);
    if (pa !== pb) return pb > pa ? b : a;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    return parseInt(b.number) > parseInt(a.number) ? b : a;
  });
  return cardImageUrl(best);
}

// Simple string hash → deterministic "random" index, so the pick stays stable across regens
// (only changing if the underlying candidate list itself changes) rather than reshuffling every
// CI run for no reason.
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Pumpkaboo/Gourgeist's size variants (Small/Large/Super) aren't distinguished by card name in
// the TCG, and no full-art printing exists for any size yet — every candidate is a plain Common.
// Rather than always picking the same "highest value" card for every size (making them all look
// identical), pick a deterministic pseudo-random candidate per size so they're at least visually
// distinct. Revisit this once a real Illustration Rare/Special Illustration Rare appears for
// either species — at that point a normal price-ranked pick should take over.
export async function randomFormePick(displayName: string, seed: string): Promise<string | null> {
  const cards = await fetchAllPages(`name:"${displayName}"`);
  const candidates = cards.filter(c => c.images?.large && nameMatches(c.name, displayName));
  if (!candidates.length) return null;
  const idx = stableHash(seed) % candidates.length;
  return cardImageUrl(candidates[idx]);
}

// Fetch a single card by pokemontcg.io ID (e.g. "xy8-64") and return its image URL.
export async function fetchCardById(cardId: string): Promise<string | null> {
  try {
    const res = await fetch(`${PTCGIO_BASE}/cards/${encodeURIComponent(cardId)}`, {
      headers: getHeaders(),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: PtcgCard };
    if (!json.data?.images) return null;
    return cardImageUrl(json.data);
  } catch { return null; }
}

