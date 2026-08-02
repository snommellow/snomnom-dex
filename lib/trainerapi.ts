// Trainer roster source: PokeAPI has zero trainer data, and Bulbapedia isn't reachable from
// this environment, so the actual trainer list comes from pret/pokered — the open-source
// decompilation of Pokémon Red/Blue (constants/trainer_constants.asm lists every trainer class
// and named character, e.g. Brock/Misty/gym leaders are each their own "class" of one).
// pokemontcg.io's Trainer/Supporter cards are used ONLY for portrait art where a name matches —
// they no longer define who counts as a trainer, per the point of this page being a dex of
// trainers, not a catalog of every card that happens to exist.

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

interface PtcgCard {
  id: string;
  number: string;
  name: string;
  rarity: string;
  set: { id: string };
  images: { small: string; large: string | null };
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null }> };
}

export interface TrainerEntry {
  name: string;
  slug: string;
  region: string;
  imageUrl: string | null;
  // Whether imageUrl is a borderless full-art illustration vs a plain bordered card with a
  // rules text box — most Supporter cards are the latter, so they need the same "cropped"
  // scale-and-shift treatment the Pokémon pipeline uses for non-full-art cards (regularCardUrl),
  // not the full-bleed background treatment, or the rules text bleeds through mid-card.
  isFullArt: boolean;
}

// pokemontcg.io set IDs for the original WotC-era prints (1998-2003) — Base Set through Neo
// Destiny plus the Expedition/Aquapolis/Skyridge e-Card sets. These predate the "Supporter"
// subtype mechanic entirely (introduced in EX Ruby & Sapphire, 2003), so a card search scoped to
// subtypes:Supporter silently excludes every classic trainer-class card from the pool — the
// bug behind every match coming back as a modern anime-style reimagining instead of the
// period-accurate Gen 1 look.
const CLASSIC_SET_RE = /^(base|gym|neo|ecard)/i;

// Same rarity-tier idea as the Pokémon pipeline's RARITY_ORDER, but scoped to what Supporter
// cards actually carry — full-art illustration tiers first, then holo/secret tiers, then plain.
// "Ultra Rare" (modern SV/SWSH naming) and "Rare Ultra" (older EX/pre-SWSH naming) are the same
// tier under two different strings pokemontcg.io has used across eras — both must be listed, or
// a card tagged with whichever one is missing scores a fallback 99 (worse than Uncommon), which
// let vintage bordered cards win over modern full-art ones for named trainers.
const SUPPORTER_RARITY_ORDER = [
  "Special Illustration Rare",
  "Illustration Rare",
  "Hyper Rare",
  "Rare Secret",
  "Rare Shiny",
  "Ultra Rare",
  "Rare Ultra",
  "Rare Holo Star",
  "Rare Holo",
  "Rare",
  "Uncommon",
  "Common",
  "Promo",
];

// Same idea as IR_RARITIES/VGX_RARITIES in tcgapi.ts — the tiers that print as a borderless
// full-bleed illustration rather than the classic bordered card with a rules text box.
const FULL_ART_RARITIES = new Set([
  "Special Illustration Rare",
  "Illustration Rare",
  "Hyper Rare",
  "Rare Secret",
  "Ultra Rare",
  "Rare Ultra",
]);

function rarityScore(rarity: string): number {
  const idx = SUPPORTER_RARITY_ORDER.indexOf(rarity);
  return idx === -1 ? 99 : idx;
}

function marketPrice(card: PtcgCard): number {
  const prices = card.tcgplayer?.prices;
  if (!prices) return 0;
  return Math.max(0, ...Object.values(prices).map((p) => p?.market ?? p?.mid ?? 0));
}

function cardImageUrl(card: PtcgCard): string {
  return card.images.large ?? card.images.small;
}

function pickBestCard(cards: PtcgCard[]): PtcgCard | null {
  if (!cards.length) return null;
  return cards.reduce((a, b) => {
    const ra = rarityScore(a.rarity), rb = rarityScore(b.rarity);
    if (ra !== rb) return ra < rb ? a : b;
    const pa = marketPrice(a), pb = marketPrice(b);
    if (pa !== pb) return pb > pa ? b : a;
    if (a.set.id !== b.set.id) return b.set.id > a.set.id ? b : a;
    const aNum = parseInt(a.number) || 0, bNum = parseInt(b.number) || 0;
    return bNum >= aNum ? b : a;
  });
}

async function fetchAllPages(q: string): Promise<PtcgCard[]> {
  const results: PtcgCard[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,number,name,rarity,set,images,tcgplayer`;
    let data: PtcgCard[] | null = null;
    let succeeded = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text) throw new Error("empty body");
        const parsed = JSON.parse(text).data;
        // A 200 response with an empty/missing data array on page 1 is indistinguishable from
        // "query legitimately has zero matches" at the HTTP level, but for a broad query like
        // supertype:Trainer that's always known to have thousands of results — treating it as
        // success here silently truncated the entire card catalog to nothing with no error
        // logged, breaking pagination on the very first page. Retry instead of accepting it.
        if (page === 1 && (!parsed || parsed.length === 0)) throw new Error("empty data on page 1");
        data = parsed;
        succeeded = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!succeeded) {
      console.log(`[fetchAllPages] giving up on page ${page} for query "${q}" after 5 attempts — this page's results will be missing`);
    }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return results;
}

export function toTrainerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/♂/g, "-m")
    .replace(/♀/g, "-f")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Kanto (Gen 1) roster, sourced from pret/pokered's constants/trainer_constants.asm — every
// trainer class and named character the games define. Ordered by game progression: Gym Leaders
// (fought first) → Elite Four → Champion (fought last) → other named characters → generic
// trainer classes last. RIVAL2/RIVAL3 are the same person as RIVAL1 at later battle stages, so
// they collapse into one "Rival" entry rather than three. searchNames are the candidate TCG
// Supporter-card names to try for portrait art, tried in order — a miss just means no art, not
// a missing trainer. special marks named individuals (gym leaders, Elite Four, Champion, Rival,
// Professor Oak, Team Rocket/Giovanni) — these get the single best/most valuable card regardless
// of era, unlike generic trainer classes which prefer the period-accurate 1998-2003 WotC-era
// print.
const KANTO_ROSTER: { name: string; searchNames: string[]; special?: boolean; region?: string }[] = [
  // Gym Leaders
  { name: "Brock", searchNames: ["Brock"], special: true },
  { name: "Misty", searchNames: ["Misty"], special: true },
  { name: "Lt. Surge", searchNames: ["Lt. Surge", "Surge"], special: true },
  { name: "Erika", searchNames: ["Erika"], special: true },
  { name: "Koga", searchNames: ["Koga"], special: true },
  { name: "Sabrina", searchNames: ["Sabrina"], special: true },
  { name: "Blaine", searchNames: ["Blaine"], special: true },
  { name: "Giovanni", searchNames: ["Giovanni"], special: true },
  // Elite Four
  { name: "Lorelei", searchNames: ["Lorelei"], special: true },
  { name: "Bruno", searchNames: ["Bruno"], special: true },
  { name: "Agatha", searchNames: ["Agatha"], special: true },
  { name: "Lance", searchNames: ["Lance"], special: true },
  // Protagonist & Rival — RIVAL1/RIVAL2/RIVAL3 collapse to "Blue" (their canon English name)
  // rather than the generic constant name "Rival"; "Red" is the player character and "Green"
  // is the rival's Japanese-canon name, both with their own TCG cards.
  { name: "Red", searchNames: ["Red"], special: true },
  { name: "Blue", searchNames: ["Blue"], special: true },
  { name: "Green", searchNames: ["Green"], special: true },
  // Other named characters
  { name: "Professor Oak", searchNames: ["Professor Oak", "Oak"], special: true },
  { name: "Team Rocket Grunt", searchNames: ["Team Rocket Grunt", "Rocket Grunt"], special: true },
  { name: "Bill", searchNames: ["Bill"], special: true },
  { name: "Mr. Fuji", searchNames: ["Mr. Fuji", "Fuji"], special: true },
  { name: "Daisy", searchNames: ["Daisy"], special: true },
  { name: "Copycat", searchNames: ["Copycat"], special: true },
  // Johto (Gen 2) named characters. Bruno, Koga, and Lance are NOT repeated here — they're the
  // same people already listed above, canonically reappearing as Johto's Elite Four (Bruno,
  // Koga) and Champion (Lance).
  { name: "Falkner", searchNames: ["Falkner"], special: true, region: "Johto" },
  { name: "Bugsy", searchNames: ["Bugsy"], special: true, region: "Johto" },
  { name: "Whitney", searchNames: ["Whitney"], special: true, region: "Johto" },
  { name: "Morty", searchNames: ["Morty"], special: true, region: "Johto" },
  { name: "Chuck", searchNames: ["Chuck"], special: true, region: "Johto" },
  { name: "Jasmine", searchNames: ["Jasmine"], special: true, region: "Johto" },
  { name: "Pryce", searchNames: ["Pryce"], special: true, region: "Johto" },
  { name: "Clair", searchNames: ["Clair"], special: true, region: "Johto" },
  { name: "Will", searchNames: ["Will"], special: true, region: "Johto" },
  { name: "Karen", searchNames: ["Karen"], special: true, region: "Johto" },
  { name: "Silver", searchNames: ["Silver"], special: true, region: "Johto" },
  { name: "Professor Elm", searchNames: ["Professor Elm", "Elm"], special: true, region: "Johto" },
  { name: "Ariana", searchNames: ["Ariana"], special: true, region: "Johto" },
  { name: "Proton", searchNames: ["Proton"], special: true, region: "Johto" },
  { name: "Petrel", searchNames: ["Petrel"], special: true, region: "Johto" },
  { name: "Archer", searchNames: ["Archer"], special: true, region: "Johto" },
  { name: "Eusine", searchNames: ["Eusine"], special: true, region: "Johto" },
  { name: "Mr. Pokémon", searchNames: ["Mr. Pokémon", "Mr. Pokemon"], special: true, region: "Johto" },
  { name: "Kurt", searchNames: ["Kurt"], special: true, region: "Johto" },
  // Generic trainer classes — not Kanto-specific (every region has these), tagged "Universal".
  // Kanto's own roster (Gen 1) first, then every other generic class introduced across Gen
  // 2-9, deduplicated where a later game reused an earlier class name.
  { name: "Youngster", searchNames: ["Youngster"] },
  { name: "Bug Catcher", searchNames: ["Bug Catcher"] },
  { name: "Lass", searchNames: ["Lass"] },
  { name: "Sailor", searchNames: ["Sailor"] },
  { name: "Jr. Trainer♂", searchNames: ["Jr. Trainer"] },
  { name: "Jr. Trainer♀", searchNames: ["Jr. Trainer"] },
  { name: "Pokémaniac", searchNames: ["Pokemaniac", "Pokémaniac"] },
  { name: "Super Nerd", searchNames: ["Super Nerd"] },
  { name: "Hiker", searchNames: ["Hiker"] },
  { name: "Biker", searchNames: ["Biker"] },
  { name: "Burglar", searchNames: ["Burglar"] },
  { name: "Engineer", searchNames: ["Engineer"] },
  { name: "Fisherman", searchNames: ["Fisherman", "Fisher"] },
  { name: "Swimmer", searchNames: ["Swimmer"] },
  { name: "Cue Ball", searchNames: ["Cue Ball"] },
  { name: "Gambler", searchNames: ["Gambler"] },
  { name: "Beauty", searchNames: ["Beauty"] },
  { name: "Psychic", searchNames: ["Psychic"] },
  { name: "Rocker", searchNames: ["Rocker"] },
  { name: "Juggler", searchNames: ["Juggler"] },
  { name: "Tamer", searchNames: ["Tamer"] },
  { name: "Bird Keeper", searchNames: ["Bird Keeper"] },
  { name: "Blackbelt", searchNames: ["Black Belt", "Blackbelt"] },
  { name: "Chief", searchNames: ["Chief"] },
  { name: "Scientist", searchNames: ["Scientist"] },
  { name: "Cooltrainer♂", searchNames: ["Cooltrainer", "Ace Trainer"] },
  { name: "Cooltrainer♀", searchNames: ["Cooltrainer", "Ace Trainer"] },
  { name: "Gentleman", searchNames: ["Gentleman"] },
  { name: "Channeler", searchNames: ["Channeler"] },
  // Gen 2 (Johto)
  { name: "Camper", searchNames: ["Camper"] },
  { name: "Picnicker", searchNames: ["Picnicker"] },
  { name: "Pokéfan♂", searchNames: ["Pokéfan", "Pokefan", "Poké Fan"] },
  { name: "Pokéfan♀", searchNames: ["Pokéfan", "Pokefan", "Poké Fan"] },
  { name: "Teacher", searchNames: ["Teacher"] },
  { name: "Boarder", searchNames: ["Boarder"] },
  { name: "Skier", searchNames: ["Skier"] },
  { name: "Medium", searchNames: ["Medium"] },
  { name: "Kimono Girl", searchNames: ["Kimono Girl"] },
  { name: "Sage", searchNames: ["Sage"] },
  { name: "Officer", searchNames: ["Officer", "Policeman"] },
  { name: "Firebreather", searchNames: ["Firebreather"] },
  { name: "Guitarist", searchNames: ["Guitarist"] },
  // Gen 3 (Hoenn)
  { name: "Aroma Lady", searchNames: ["Aroma Lady"] },
  { name: "Bug Maniac", searchNames: ["Bug Maniac"] },
  { name: "Collector", searchNames: ["Collector"] },
  { name: "Crush Girl", searchNames: ["Crush Girl"] },
  { name: "Expert", searchNames: ["Expert"] },
  { name: "Kindler", searchNames: ["Kindler"] },
  { name: "Lady", searchNames: ["Lady"] },
  { name: "Ninja Boy", searchNames: ["Ninja Boy"] },
  { name: "Old Couple", searchNames: ["Old Couple"] },
  { name: "Rich Boy", searchNames: ["Rich Boy"] },
  { name: "Ruin Maniac", searchNames: ["Ruin Maniac"] },
  { name: "School Kid", searchNames: ["School Kid"] },
  { name: "Sis and Bro", searchNames: ["Sis and Bro"] },
  { name: "Triathlete", searchNames: ["Triathlete"] },
  { name: "Tuber", searchNames: ["Tuber"] },
  { name: "Twins", searchNames: ["Twins"] },
  { name: "Team Aqua Grunt", searchNames: ["Team Aqua Grunt", "Aqua Grunt"] },
  { name: "Team Magma Grunt", searchNames: ["Team Magma Grunt", "Magma Grunt"] },
  // Gen 4 (Sinnoh) — "Ace Trainer" is the modern rename of Cooltrainer (merged above), and
  // "Policeman" the same NPC archetype as Officer (merged above), so neither gets its own entry.
  { name: "Battle Girl", searchNames: ["Battle Girl"] },
  { name: "Cyclist", searchNames: ["Cyclist"] },
  { name: "Dragon Tamer", searchNames: ["Dragon Tamer"] },
  { name: "Roughneck", searchNames: ["Roughneck"] },
  { name: "Veteran", searchNames: ["Veteran"] },
  { name: "Waitress", searchNames: ["Waitress"] },
  { name: "Worker", searchNames: ["Worker"] },
  { name: "Team Galactic Grunt", searchNames: ["Team Galactic Grunt", "Galactic Grunt"] },
  // Gen 5 (Unova)
  { name: "Artist", searchNames: ["Artist"] },
  { name: "Backpacker", searchNames: ["Backpacker"] },
  { name: "Baker", searchNames: ["Baker"] },
  { name: "Clerk", searchNames: ["Clerk"] },
  { name: "Depot Agent", searchNames: ["Depot Agent"] },
  { name: "Doctor", searchNames: ["Doctor"] },
  { name: "Nurse", searchNames: ["Nurse"] },
  { name: "Nursery Aide", searchNames: ["Nursery Aide"] },
  { name: "Parasol Lady", searchNames: ["Parasol Lady"] },
  { name: "Pokémon Breeder", searchNames: ["Pokémon Breeder", "Pokemon Breeder"] },
  { name: "Pokémon Ranger", searchNames: ["Pokémon Ranger", "Pokemon Ranger"] },
  { name: "Preschooler", searchNames: ["Preschooler"] },
  { name: "Socialite", searchNames: ["Socialite"] },
  { name: "Waiter", searchNames: ["Waiter"] },
  { name: "Musician", searchNames: ["Musician"] },
  { name: "Team Plasma Grunt", searchNames: ["Team Plasma Grunt", "Plasma Grunt"] },
  // Gen 6 (Kalos)
  { name: "Fairy Tale Girl", searchNames: ["Fairy Tale Girl"] },
  { name: "Furisode Girl", searchNames: ["Furisode Girl"] },
  { name: "Hex Maniac", searchNames: ["Hex Maniac"] },
  { name: "Punk Guy", searchNames: ["Punk Guy"] },
  { name: "Punk Girl", searchNames: ["Punk Girl"] },
  { name: "Sky Trainer", searchNames: ["Sky Trainer"] },
  { name: "Team Flare Grunt", searchNames: ["Team Flare Grunt", "Flare Grunt"] },
  // Gen 7 (Alola)
  { name: "Delinquent", searchNames: ["Delinquent"] },
  { name: "Golfer", searchNames: ["Golfer"] },
  { name: "Office Worker", searchNames: ["Office Worker"] },
  { name: "Rising Star", searchNames: ["Rising Star"] },
  { name: "Surfer", searchNames: ["Surfer"] },
  { name: "Team Skull Grunt", searchNames: ["Team Skull Grunt", "Skull Grunt"] },
  { name: "Aether Foundation Employee", searchNames: ["Aether Foundation Employee"] },
  // Gen 8 (Galar)
  { name: "League Staff", searchNames: ["League Staff"] },
  { name: "Team Yell Grunt", searchNames: ["Team Yell Grunt", "Yell Grunt"] },
  { name: "Cheerleader", searchNames: ["Cheerleader"] },
  // Gen 9 (Paldea)
  { name: "Rancher", searchNames: ["Rancher"] },
  { name: "Restaurant Employee", searchNames: ["Restaurant Employee"] },
  { name: "Sports Student", searchNames: ["Sports Student"] },
  { name: "Student", searchNames: ["Student"] },
];

// The point of the Trainers page is one tile per trainer, not one per card — pokemontcg.io
// names most Supporter cards after their signature move ("Bill's Analysis", "Bill's
// Maintenance", "Bill's Transfer"), so the possessive prefix is the trainer's actual name.
function soloIndexName(cardName: string): string {
  const noVariantTag = cardName.replace(/\s*\([^)]*\)\s*$/, "");
  const possessiveMatch = noVariantTag.match(/^(.+?)['']s\s+.+$/);
  return (possessiveMatch ? possessiveMatch[1] : noVariantTag).toLowerCase();
}

// Organizations whose Supporter cards flip the usual possessive pattern: instead of "Ariana's
// Something" (person's signature move — the standard shape soloIndexName handles), these are
// "Team Rocket's Ariana" (org's member) — the actual person's name is what comes AFTER 's, not
// before. Missing this meant Ariana/Proton/Petrel/Archer's cards indexed under "team rocket"
// and never matched their own roster entries at all.
const ORG_POSSESSIVE_PREFIXES = ["Team Rocket", "Team Aqua", "Team Magma", "Team Galactic", "Team Plasma", "Team Flare", "Team Skull", "Team Yell"];

// Tag-team/combo cards ("Misty & Lorelei", "Red & Blue") indexed under each individual name
// they contain — kept in a SEPARATE map from solo cards, and only ever consulted as a fallback
// when a trainer has no solo card. Mixing them into the same pool let a co-starring card (which
// can be pricier/rarer, e.g. a Tag Team GX) outrank and steal a trainer's own dedicated card
// (Red's "Red's Challenge" and Blue's "Blue's Tactics" were both getting replaced by the shared
// "Red & Blue" tag-team card this way before the split).
function comboIndexNames(cardName: string): string[] {
  const noVariantTag = cardName.replace(/\s*\([^)]*\)\s*$/, "");
  const names: string[] = [];
  if (/ & /.test(noVariantTag)) {
    names.push(...noVariantTag.split(" & ").map((p) => p.trim().toLowerCase()).filter(Boolean));
  }
  for (const org of ORG_POSSESSIVE_PREFIXES) {
    const match = noVariantTag.match(new RegExp(`^${org}['’]s\\s+(.+)$`, "i"));
    if (match) names.push(match[1].trim().toLowerCase());
  }
  return names;
}

// --- Pocket (TCGdex) fallback — used only when no paper-TCG card matches a trainer ---

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  category?: string;
  trainerType?: string;
}

const POCKET_STAR_SCORE: Record<string, number> = { "Three Star": 0, "Two Star": 1, "One Star": 2 };

function isPocketSetId(setId: string): boolean {
  return /^[AB]\d/i.test(setId);
}

async function fetchTcgdexJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
      const res = await fetch(url, { next: { revalidate: 86400 } } as RequestInit);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch { /* retry */ }
  }
  return null;
}

async function fetchPocketTrainerImage(searchNames: string[]): Promise<{ url: string | null; isFullArt: boolean }> {
  for (const name of searchNames) {
    const list = await fetchTcgdexJson<TcgdexCard[]>(`${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}`);
    const candidates = (list ?? []).filter(
      (c) => c.name.toLowerCase() === name.toLowerCase() && isPocketSetId(c.id.split("-")[0] ?? "")
    );
    if (!candidates.length) continue;
    const details = await Promise.all(candidates.map((c) => fetchTcgdexJson<TcgdexCard>(`${TCGDEX_BASE}/cards/${c.id}`)));
    const supporterCards = details.filter(
      (d): d is TcgdexCard => !!d && d.category === "Trainer" && d.trainerType === "Supporter" && !!d.image
    );
    if (!supporterCards.length) continue;
    const best = supporterCards.reduce((a, b) => {
      const ra = POCKET_STAR_SCORE[a.rarity ?? ""] ?? 99;
      const rb = POCKET_STAR_SCORE[b.rarity ?? ""] ?? 99;
      if (ra !== rb) return ra < rb ? a : b;
      return b.id > a.id ? b : a;
    });
    // Pocket has no bordered/plain print style — every card is a full-bleed illustration.
    return { url: `${best.image}/high.webp`, isFullArt: true };
  }
  return { url: null, isFullArt: false };
}

// Builds the Kanto trainer roster with portrait art pulled from pokemontcg.io Trainer cards
// where a name matches, falling back to Pocket (TCGdex) only when the paper TCG has nothing —
// the card catalogs are art lookup only, not the trainer list itself. Queries all
// supertype:Trainer cards, not just subtypes:Supporter, since the classic 1998-2003 WotC-era
// cards that best represent the original Gen 1 look predate the Supporter subtype and would
// otherwise be invisible to a Supporter-scoped search.
export async function fetchTrainerEntries(): Promise<TrainerEntry[]> {
  const cards = await fetchAllPages("supertype:Trainer");
  const soloByName = new Map<string, PtcgCard[]>();
  const comboByName = new Map<string, PtcgCard[]>();
  for (const c of cards) {
    if (!c.images?.large) continue;
    const soloKey = soloIndexName(c.name);
    const soloList = soloByName.get(soloKey);
    if (soloList) soloList.push(c);
    else soloByName.set(soloKey, [c]);
    for (const comboKey of comboIndexNames(c.name)) {
      const comboList = comboByName.get(comboKey);
      if (comboList) comboList.push(c);
      else comboByName.set(comboKey, [c]);
    }
  }

  function pickFromGroup(group: PtcgCard[], special: boolean | undefined): { imageUrl: string; isFullArt: boolean } | null {
    let best: PtcgCard | null;
    let usedClassic = false;
    if (special) {
      // Named individuals get whatever card is most valuable, any era — their best modern
      // full-art illustrations are the point, not a vintage-accurate print.
      best = pickBestCard(group);
    } else {
      // Generic trainer classes prefer the original WotC-era print when one exists —
      // period-accurate for a Kanto dex — falling back to the full pool otherwise.
      const classicCards = group.filter((c) => CLASSIC_SET_RE.test(c.set.id));
      usedClassic = classicCards.length > 0;
      best = pickBestCard(usedClassic ? classicCards : group);
    }
    if (!best) return null;
    return {
      imageUrl: cardImageUrl(best),
      // Classic-era Trainer cards are always bordered — no full-art printing existed yet.
      isFullArt: usedClassic ? false : FULL_ART_RARITIES.has(best.rarity),
    };
  }

  return Promise.all(
    KANTO_ROSTER.map(async ({ name, searchNames, special, region }) => {
      let imageUrl: string | null = null;
      let isFullArt = false;
      // Solo cards always win first — a co-starring tag-team card is only used if the trainer
      // has no dedicated card of their own at all.
      for (const map of [soloByName, comboByName]) {
        if (imageUrl) break;
        for (const candidate of searchNames) {
          const group = map.get(candidate.toLowerCase());
          if (!group) continue;
          const picked = pickFromGroup(group, special);
          if (picked) { imageUrl = picked.imageUrl; isFullArt = picked.isFullArt; break; }
        }
      }
      if (!imageUrl) {
        const pocket = await fetchPocketTrainerImage(searchNames);
        imageUrl = pocket.url;
        isFullArt = pocket.isFullArt;
      }
      // Generic trainer classes (Youngster, Sailor, etc.) aren't region-specific — every region
      // has its own Youngsters and Sailors — so only named individuals get a real region tag,
      // defaulting to Kanto when not overridden (Johto entries set region explicitly).
      return { name, slug: toTrainerSlug(name), region: region ?? (special ? "Kanto" : "Universal"), imageUrl, isFullArt };
    })
  );
}
