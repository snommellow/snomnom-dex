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
  roles: string[];
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
  let totalCount: number | null = null;
  let consecutiveFailures = 0;
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
        const json = JSON.parse(text);
        const parsed = json.data;
        // A 200 response with an empty/missing data array on page 1 is indistinguishable from
        // "query legitimately has zero matches" at the HTTP level, but for a broad query like
        // supertype:Trainer that's always known to have thousands of results — treating it as
        // success here silently truncated the entire card catalog to nothing with no error
        // logged. Retry instead of accepting it.
        if (page === 1 && (!parsed || parsed.length === 0)) throw new Error("empty data on page 1");
        data = parsed;
        if (typeof json.totalCount === "number") totalCount = json.totalCount;
        succeeded = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!succeeded) {
      // A page failing all retries used to be treated as "reached the end," silently dropping
      // every later page too — for a query with 15+ pages, one bad page anywhere truncated the
      // rest of the catalog with no error logged beyond this line. Skip the page and keep going
      // instead: pagination only stops on a genuinely short/empty successful page, or once we've
      // accounted for the API's own reported totalCount, or after too many consecutive failures
      // (a real outage, not a one-off blip).
      console.log(`[fetchAllPages] giving up on page ${page} for query "${q}" after 5 attempts — this page's results will be missing`);
      consecutiveFailures++;
      if (consecutiveFailures >= 5) break;
      page++;
      continue;
    }
    consecutiveFailures = 0;
    if (data && data.length > 0) results.push(...data);
    if (!data || data.length < 250) break;
    if (totalCount !== null && results.length >= totalCount) break;
    page++;
  }
  return results;
}

// Role(s) shown in the card subtitle, replacing the generic "Trainer of {region}." filler that
// duplicated the region already shown in the bottom pill. Grouped by role rather than listed
// inline per roster entry to keep the roster itself readable; anything not listed here (mostly
// minor named NPCs with no crisp title) falls back to "Trainer". Many characters hold more than
// one title across the games they appear in (e.g. Lance is Elite Four in Gen 1, Champion in
// Gen 2; Molayne is a Trial Captain who's later promoted to Elite Four in the Ultra games) — a
// name can appear in multiple assignRole calls and all of them are kept, in call order.
const TRAINER_ROLES: Record<string, string[]> = {};
function assignRole(role: string, names: string[]) {
  for (const n of names) (TRAINER_ROLES[n] ??= []).push(role);
}
assignRole("Gym Leader", [
  "Brock", "Misty", "Lt. Surge", "Erika", "Koga", "Sabrina", "Blaine", "Giovanni",
  "Falkner", "Bugsy", "Whitney", "Morty", "Chuck", "Jasmine", "Pryce", "Clair",
  "Roxanne", "Brawly", "Wattson", "Flannery", "Norman", "Winona", "Tate", "Liza", "Wallace", "Juan",
  "Roark", "Gardenia", "Maylene", "Crasher Wake", "Fantina", "Byron", "Candice", "Volkner",
  "Cilan", "Chili", "Cress", "Lenora", "Burgh", "Elesa", "Clay", "Skyla", "Brycen", "Drayden", "Roxie", "Marlon",
  "Viola", "Grant", "Korrina", "Ramos", "Clemont", "Valerie", "Olympia", "Wulfric",
  "Milo", "Nessa", "Kabu", "Bea", "Allister", "Opal", "Gordie", "Melony", "Piers", "Raihan",
  "Katy", "Brassius", "Iono", "Kofu", "Larry", "Ryme", "Tulip", "Grusha", "Tyme",
]);
assignRole("Elite Four", [
  "Lorelei", "Bruno", "Agatha", "Lance", "Will", "Karen",
  "Sidney", "Phoebe", "Glacia", "Drake",
  "Aaron", "Bertha", "Flint", "Lucian",
  "Shauntal", "Marshal", "Grimsley", "Caitlin",
  "Malva", "Siebold", "Wikstrom", "Drasna",
  "Rika", "Poppy", "Hassel",
]);
assignRole("Champion", ["Lance", "Wallace", "Steven", "Cynthia", "Alder", "Iris", "Diantha", "Leon", "Geeta"]);
assignRole("Rival", [
  "Blue", "Green", "Silver", "May", "Brendan", "Wally", "Barry", "Cheren", "Bianca", "Hugh",
  "Serena", "Calem", "Shauna", "Tierno", "Trevor", "Hau", "Hop", "Marnie", "Bede", "Nemona", "Arven",
]);
assignRole("Protagonist", ["Red", "Leaf", "Ethan", "Lyra", "Dawn", "Rosa", "Hilda", "Gloria"]);
assignRole("Professor", [
  "Professor Oak", "Professor Elm", "Professor Birch", "Professor Rowan", "Professor Juniper",
  "Professor Sycamore", "Professor Kukui", "Professor Burnet", "Professor Cozmo", "Professor Magnolia",
  "Professor Sada", "Professor Turo", "Professor Laventon", "Cedric Juniper", "Samson Oak",
]);
assignRole("Team Leader", [
  "Archie", "Maxie", "Cyrus", "Ghetsis", "Lysandre", "Guzma", "Rose", "Giacomo", "Mela", "Atticus", "Ortega", "Eri",
  "Blanche", "Candela", "Spark",
]);
assignRole("Team Admin", [
  "Ariana", "Proton", "Petrel", "Archer", "Mars", "Jupiter", "Saturn", "Charon",
  "N", "Colress", "Zinnia", "Xerosic", "Plumeria", "Lusamine", "Faba", "Wicke", "Oleana",
  "Cassiopeia", "Penny", "Sordward", "Shielbert", "Emma",
]);
assignRole("Kahuna", ["Hala", "Olivia", "Nanu", "Hapu"]);
assignRole("Trial Captain", ["Ilima", "Lana", "Kiawe", "Mallow", "Sophocles", "Acerola", "Mina", "Kahili", "Molayne"]);
// Molayne is promoted from Trial Captain to Elite Four in Ultra Sun/Ultra Moon.
assignRole("Elite Four", ["Molayne"]);
assignRole("Frontier Brain", [
  "Scott", "Anabel", "Noland", "Greta", "Tucker", "Lucy", "Spenser", "Brandon",
  "Palmer", "Argenta", "Dahlia", "Darach", "Thorton",
]);

function assignRolesFor(name: string): string[] {
  return TRAINER_ROLES[name] ?? ["Trainer"];
}

// Region display order — same sequence as REGION_ACCENT in components/TrainerCard.tsx, so the
// grid's grouping matches the color coding already established there.
const REGION_ORDER = [
  "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Paldea",
  "Hisui", "Lumiose", "Pokémon GO", "Universal",
];

// Within a region: Gym Leader -> Elite Four -> Champion -> Protagonist first, then every other
// named-individual role (Rival, Professor, Team Leader, etc.) as a single "special trainer"
// bucket, with generic (non-special) Trainer Class entries last.
const ROLE_RANK: Record<string, number> = {
  "Gym Leader": 0,
  "Elite Four": 1,
  Champion: 2,
  Protagonist: 3,
  "Trainer Class": 5,
};
function bestRoleRank(roles: string[]): number {
  return Math.min(...roles.map((r) => ROLE_RANK[r] ?? 4));
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
  { name: "Team Rocket Grunt", searchNames: ["Team Rocket Grunt", "Rocket Grunt"], special: true, region: "Universal" },
  { name: "Bill", searchNames: ["Bill"], special: true },
  { name: "Mr. Fuji", searchNames: ["Mr. Fuji", "Fuji"], special: true },
  { name: "Daisy", searchNames: ["Daisy"], special: true },
  { name: "Copycat", searchNames: ["Copycat"], special: true },
  { name: "Leaf", searchNames: ["Leaf"], special: true },
  { name: "Janine", searchNames: ["Janine"], special: true },
  { name: "Jessie", searchNames: ["Jessie"], special: true },
  { name: "James", searchNames: ["James"], special: true },
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
  { name: "Ethan", searchNames: ["Ethan"], special: true, region: "Johto" },
  { name: "Lyra", searchNames: ["Lyra"], special: true, region: "Johto" },
  // Hoenn (Gen 3) named characters. Steven is Ruby/Sapphire's Champion; Wallace succeeds him as
  // Emerald's Champion (and is also the 8th Gym Leader in Ruby/Sapphire) — both kept as their
  // own entries since both are canonically Champion depending on version.
  { name: "Roxanne", searchNames: ["Roxanne"], special: true, region: "Hoenn" },
  { name: "Brawly", searchNames: ["Brawly"], special: true, region: "Hoenn" },
  { name: "Wattson", searchNames: ["Wattson"], special: true, region: "Hoenn" },
  { name: "Flannery", searchNames: ["Flannery"], special: true, region: "Hoenn" },
  { name: "Norman", searchNames: ["Norman"], special: true, region: "Hoenn" },
  { name: "Winona", searchNames: ["Winona"], special: true, region: "Hoenn" },
  { name: "Tate", searchNames: ["Tate"], special: true, region: "Hoenn" },
  { name: "Liza", searchNames: ["Liza"], special: true, region: "Hoenn" },
  { name: "Wallace", searchNames: ["Wallace"], special: true, region: "Hoenn" },
  { name: "Juan", searchNames: ["Juan"], special: true, region: "Hoenn" },
  { name: "Sidney", searchNames: ["Sidney"], special: true, region: "Hoenn" },
  { name: "Phoebe", searchNames: ["Phoebe"], special: true, region: "Hoenn" },
  { name: "Glacia", searchNames: ["Glacia"], special: true, region: "Hoenn" },
  { name: "Drake", searchNames: ["Drake"], special: true, region: "Hoenn" },
  { name: "Steven", searchNames: ["Steven"], special: true, region: "Hoenn" },
  { name: "May", searchNames: ["May"], special: true, region: "Hoenn" },
  { name: "Brendan", searchNames: ["Brendan"], special: true, region: "Hoenn" },
  { name: "Professor Birch", searchNames: ["Professor Birch", "Birch"], special: true, region: "Hoenn" },
  { name: "Archie", searchNames: ["Archie"], special: true, region: "Hoenn" },
  { name: "Maxie", searchNames: ["Maxie"], special: true, region: "Hoenn" },
  { name: "Wally", searchNames: ["Wally"], special: true, region: "Hoenn" },
  { name: "Celio", searchNames: ["Celio"], special: true, region: "Hoenn" },
  { name: "Mr. Briney", searchNames: ["Mr. Briney"], special: true, region: "Hoenn" },
  { name: "Mr. Stone", searchNames: ["Mr. Stone"], special: true, region: "Hoenn" },
  { name: "Roseanne", searchNames: ["Roseanne"], special: true, region: "Hoenn" },
  { name: "Clive", searchNames: ["Clive"], special: true, region: "Hoenn" },
  { name: "Zinnia", searchNames: ["Zinnia"], special: true, region: "Hoenn" },
  { name: "Lisia", searchNames: ["Lisia"], special: true, region: "Hoenn" },
  { name: "Bebe", searchNames: ["Bebe"], special: true, region: "Hoenn" },
  { name: "Lanette", searchNames: ["Lanette"], special: true, region: "Hoenn" },
  // Battle Frontier (Emerald) — Scott recruits the player; the 7 Frontier Brains each head one
  // facility (Anabel/Battle Tower, Noland/Battle Factory, Greta/Battle Arena, Tucker/Battle
  // Dome, Lucy/Battle Pike, Spenser/Battle Palace, Brandon/Battle Pyramid).
  { name: "Scott", searchNames: ["Scott"], special: true, region: "Hoenn" },
  { name: "Anabel", searchNames: ["Anabel"], special: true, region: "Hoenn" },
  { name: "Noland", searchNames: ["Noland"], special: true, region: "Hoenn" },
  { name: "Greta", searchNames: ["Greta"], special: true, region: "Hoenn" },
  { name: "Tucker", searchNames: ["Tucker"], special: true, region: "Hoenn" },
  { name: "Lucy", searchNames: ["Lucy"], special: true, region: "Hoenn" },
  { name: "Spenser", searchNames: ["Spenser"], special: true, region: "Hoenn" },
  { name: "Brandon", searchNames: ["Brandon"], special: true, region: "Hoenn" },
  // Sinnoh (Gen 4) named characters
  { name: "Roark", searchNames: ["Roark"], special: true, region: "Sinnoh" },
  { name: "Gardenia", searchNames: ["Gardenia"], special: true, region: "Sinnoh" },
  { name: "Maylene", searchNames: ["Maylene"], special: true, region: "Sinnoh" },
  { name: "Crasher Wake", searchNames: ["Crasher Wake"], special: true, region: "Sinnoh" },
  { name: "Fantina", searchNames: ["Fantina"], special: true, region: "Sinnoh" },
  { name: "Byron", searchNames: ["Byron"], special: true, region: "Sinnoh" },
  { name: "Candice", searchNames: ["Candice"], special: true, region: "Sinnoh" },
  { name: "Volkner", searchNames: ["Volkner"], special: true, region: "Sinnoh" },
  { name: "Aaron", searchNames: ["Aaron"], special: true, region: "Sinnoh" },
  { name: "Bertha", searchNames: ["Bertha"], special: true, region: "Sinnoh" },
  { name: "Flint", searchNames: ["Flint"], special: true, region: "Sinnoh" },
  { name: "Lucian", searchNames: ["Lucian"], special: true, region: "Sinnoh" },
  { name: "Cynthia", searchNames: ["Cynthia"], special: true, region: "Sinnoh" },
  { name: "Barry", searchNames: ["Barry"], special: true, region: "Sinnoh" },
  { name: "Dawn", searchNames: ["Dawn"], special: true, region: "Sinnoh" },
  { name: "Professor Rowan", searchNames: ["Professor Rowan", "Rowan"], special: true, region: "Sinnoh" },
  { name: "Cyrus", searchNames: ["Cyrus"], special: true, region: "Sinnoh" },
  { name: "Mars", searchNames: ["Mars"], special: true, region: "Sinnoh" },
  { name: "Jupiter", searchNames: ["Jupiter"], special: true, region: "Sinnoh" },
  { name: "Saturn", searchNames: ["Saturn"], special: true, region: "Sinnoh" },
  { name: "Charon", searchNames: ["Charon"], special: true, region: "Sinnoh" },
  { name: "Looker", searchNames: ["Looker"], special: true, region: "Sinnoh" },
  { name: "Cheryl", searchNames: ["Cheryl"], special: true, region: "Sinnoh" },
  { name: "Buck", searchNames: ["Buck"], special: true, region: "Sinnoh" },
  { name: "Marley", searchNames: ["Marley"], special: true, region: "Sinnoh" },
  { name: "Riley", searchNames: ["Riley"], special: true, region: "Sinnoh" },
  { name: "Felicity", searchNames: ["Felicity"], special: true, region: "Sinnoh" },
  // Battle Frontier (Platinum) — Palmer heads the Battle Tower; Argenta (Battle Castle), Dahlia
  // (Battle Hall), Darach (Battle Arcade), and Thorton (Battle Factory) each head another
  // facility.
  { name: "Palmer", searchNames: ["Palmer"], special: true, region: "Sinnoh" },
  { name: "Argenta", searchNames: ["Argenta"], special: true, region: "Sinnoh" },
  { name: "Dahlia", searchNames: ["Dahlia"], special: true, region: "Sinnoh" },
  { name: "Darach", searchNames: ["Darach"], special: true, region: "Sinnoh" },
  { name: "Thorton", searchNames: ["Thorton"], special: true, region: "Sinnoh" },
  // Unova (Gen 5) named characters
  { name: "Cilan", searchNames: ["Cilan"], special: true, region: "Unova" },
  { name: "Chili", searchNames: ["Chili"], special: true, region: "Unova" },
  { name: "Cress", searchNames: ["Cress"], special: true, region: "Unova" },
  { name: "Lenora", searchNames: ["Lenora"], special: true, region: "Unova" },
  { name: "Burgh", searchNames: ["Burgh"], special: true, region: "Unova" },
  { name: "Elesa", searchNames: ["Elesa"], special: true, region: "Unova" },
  { name: "Clay", searchNames: ["Clay"], special: true, region: "Unova" },
  { name: "Skyla", searchNames: ["Skyla"], special: true, region: "Unova" },
  { name: "Brycen", searchNames: ["Brycen"], special: true, region: "Unova" },
  { name: "Drayden", searchNames: ["Drayden"], special: true, region: "Unova" },
  { name: "Roxie", searchNames: ["Roxie"], special: true, region: "Unova" },
  { name: "Marlon", searchNames: ["Marlon"], special: true, region: "Unova" },
  { name: "Shauntal", searchNames: ["Shauntal"], special: true, region: "Unova" },
  { name: "Marshal", searchNames: ["Marshal"], special: true, region: "Unova" },
  { name: "Grimsley", searchNames: ["Grimsley"], special: true, region: "Unova" },
  { name: "Caitlin", searchNames: ["Caitlin"], special: true, region: "Unova" },
  { name: "Alder", searchNames: ["Alder"], special: true, region: "Unova" },
  { name: "Iris", searchNames: ["Iris"], special: true, region: "Unova" },
  { name: "Cheren", searchNames: ["Cheren"], special: true, region: "Unova" },
  { name: "Bianca", searchNames: ["Bianca"], special: true, region: "Unova" },
  { name: "Hugh", searchNames: ["Hugh"], special: true, region: "Unova" },
  { name: "Emmet", searchNames: ["Emmet"], special: true, region: "Unova" },
  // Ingo's card was matched via his Legends: Arceus cameo appearance, but his primary identity
  // is Unova's Subway Boss (twin brother of Emmet, listed above) — grouped with Emmet here
  // rather than under Hisui, where he's only a late-game crossover appearance.
  { name: "Ingo", searchNames: ["Ingo"], special: true, region: "Unova" },
  { name: "Professor Juniper", searchNames: ["Professor Juniper", "Juniper"], special: true, region: "Unova" },
  { name: "Ghetsis", searchNames: ["Ghetsis"], special: true, region: "Unova" },
  { name: "N", searchNames: ["N"], special: true, region: "Unova" },
  { name: "Colress", searchNames: ["Colress"], special: true, region: "Unova" },
  { name: "Anthea", searchNames: ["Anthea"], special: true, region: "Unova" },
  { name: "Concordia", searchNames: ["Concordia"], special: true, region: "Unova" },
  { name: "Harlequin", searchNames: ["Harlequin"], special: true, region: "Unova" },
  { name: "Cedric Juniper", searchNames: ["Cedric Juniper"], special: true, region: "Unova" },
  { name: "Fennel", searchNames: ["Fennel"], special: true, region: "Unova" },
  { name: "Rosa", searchNames: ["Rosa"], special: true, region: "Unova" },
  { name: "Hilda", searchNames: ["Hilda"], special: true, region: "Unova" },
  // Kalos (Gen 6) named characters
  { name: "Viola", searchNames: ["Viola"], special: true, region: "Kalos" },
  { name: "Grant", searchNames: ["Grant"], special: true, region: "Kalos" },
  { name: "Korrina", searchNames: ["Korrina"], special: true, region: "Kalos" },
  { name: "Ramos", searchNames: ["Ramos"], special: true, region: "Kalos" },
  { name: "Clemont", searchNames: ["Clemont"], special: true, region: "Kalos" },
  { name: "Valerie", searchNames: ["Valerie"], special: true, region: "Kalos" },
  { name: "Olympia", searchNames: ["Olympia"], special: true, region: "Kalos" },
  { name: "Wulfric", searchNames: ["Wulfric"], special: true, region: "Kalos" },
  { name: "Malva", searchNames: ["Malva"], special: true, region: "Kalos" },
  { name: "Siebold", searchNames: ["Siebold"], special: true, region: "Kalos" },
  { name: "Wikstrom", searchNames: ["Wikstrom"], special: true, region: "Kalos" },
  { name: "Drasna", searchNames: ["Drasna"], special: true, region: "Kalos" },
  { name: "Diantha", searchNames: ["Diantha"], special: true, region: "Kalos" },
  { name: "Serena", searchNames: ["Serena"], special: true, region: "Kalos" },
  { name: "Calem", searchNames: ["Calem"], special: true, region: "Kalos" },
  { name: "Shauna", searchNames: ["Shauna"], special: true, region: "Kalos" },
  { name: "Tierno", searchNames: ["Tierno"], special: true, region: "Kalos" },
  { name: "Trevor", searchNames: ["Trevor"], special: true, region: "Kalos" },
  { name: "Professor Sycamore", searchNames: ["Professor Sycamore", "Sycamore"], special: true, region: "Kalos" },
  { name: "Lysandre", searchNames: ["Lysandre"], special: true, region: "Kalos" },
  { name: "Xerosic", searchNames: ["Xerosic"], special: true, region: "Kalos" },
  { name: "AZ", searchNames: ["AZ"], special: true, region: "Kalos" },
  { name: "Cyrano", searchNames: ["Cyrano"], special: true, region: "Kalos" },
  { name: "Bonnie", searchNames: ["Bonnie"], special: true, region: "Kalos" },
  // Dana/Nita: Battle Chateau-titled trainers (Bulbapedia-confirmed X and Y characters).
  { name: "Dana", searchNames: ["Dana"], special: true, region: "Kalos" },
  { name: "Nita", searchNames: ["Nita"], special: true, region: "Kalos" },
  { name: "Cassius", searchNames: ["Cassius"], special: true, region: "Kalos" },
  { name: "Emma", searchNames: ["Emma"], special: true, region: "Kalos" },
  // Alola (Gen 7) named characters
  { name: "Ilima", searchNames: ["Ilima"], special: true, region: "Alola" },
  { name: "Lana", searchNames: ["Lana"], special: true, region: "Alola" },
  { name: "Kiawe", searchNames: ["Kiawe"], special: true, region: "Alola" },
  { name: "Mallow", searchNames: ["Mallow"], special: true, region: "Alola" },
  { name: "Sophocles", searchNames: ["Sophocles"], special: true, region: "Alola" },
  { name: "Acerola", searchNames: ["Acerola"], special: true, region: "Alola" },
  { name: "Mina", searchNames: ["Mina"], special: true, region: "Alola" },
  { name: "Hala", searchNames: ["Hala"], special: true, region: "Alola" },
  { name: "Olivia", searchNames: ["Olivia"], special: true, region: "Alola" },
  { name: "Nanu", searchNames: ["Nanu"], special: true, region: "Alola" },
  { name: "Hapu", searchNames: ["Hapu"], special: true, region: "Alola" },
  { name: "Professor Kukui", searchNames: ["Professor Kukui", "Kukui"], special: true, region: "Alola" },
  { name: "Professor Burnet", searchNames: ["Professor Burnet", "Burnet"], special: true, region: "Alola" },
  { name: "Hau", searchNames: ["Hau"], special: true, region: "Alola" },
  { name: "Guzma", searchNames: ["Guzma"], special: true, region: "Alola" },
  { name: "Plumeria", searchNames: ["Plumeria"], special: true, region: "Alola" },
  { name: "Lusamine", searchNames: ["Lusamine"], special: true, region: "Alola" },
  { name: "Gladion", searchNames: ["Gladion"], special: true, region: "Alola" },
  { name: "Lillie", searchNames: ["Lillie"], special: true, region: "Alola" },
  { name: "Kahili", searchNames: ["Kahili"], special: true, region: "Alola" },
  { name: "Molayne", searchNames: ["Molayne"], special: true, region: "Alola" },
  { name: "Samson Oak", searchNames: ["Samson Oak"], special: true, region: "Alola" },
  { name: "Zisu", searchNames: ["Zisu"], special: true, region: "Hisui" },
  { name: "Welder", searchNames: ["Welder"], special: true, region: "Alola" },
  { name: "Faba", searchNames: ["Faba"], special: true, region: "Alola" },
  { name: "Wicke", searchNames: ["Wicke"], special: true, region: "Alola" },
  { name: "Professor Cozmo", searchNames: ["Professor Cozmo"], special: true, region: "Alola" },
  // Galar (Gen 8) named characters
  { name: "Milo", searchNames: ["Milo"], special: true, region: "Galar" },
  { name: "Nessa", searchNames: ["Nessa"], special: true, region: "Galar" },
  { name: "Kabu", searchNames: ["Kabu"], special: true, region: "Galar" },
  { name: "Bea", searchNames: ["Bea"], special: true, region: "Galar" },
  { name: "Allister", searchNames: ["Allister"], special: true, region: "Galar" },
  { name: "Opal", searchNames: ["Opal"], special: true, region: "Galar" },
  { name: "Gordie", searchNames: ["Gordie"], special: true, region: "Galar" },
  { name: "Melony", searchNames: ["Melony"], special: true, region: "Galar" },
  { name: "Piers", searchNames: ["Piers"], special: true, region: "Galar" },
  { name: "Raihan", searchNames: ["Raihan"], special: true, region: "Galar" },
  { name: "Leon", searchNames: ["Leon"], special: true, region: "Galar" },
  { name: "Hop", searchNames: ["Hop"], special: true, region: "Galar" },
  { name: "Marnie", searchNames: ["Marnie"], special: true, region: "Galar" },
  { name: "Bede", searchNames: ["Bede"], special: true, region: "Galar" },
  { name: "Professor Magnolia", searchNames: ["Professor Magnolia", "Magnolia"], special: true, region: "Galar" },
  { name: "Sonia", searchNames: ["Sonia"], special: true, region: "Galar" },
  { name: "Rose", searchNames: ["Rose"], special: true, region: "Galar" },
  { name: "Oleana", searchNames: ["Oleana"], special: true, region: "Galar" },
  { name: "Peony", searchNames: ["Peony"], special: true, region: "Galar" },
  { name: "Peonia", searchNames: ["Peonia"], special: true, region: "Galar" },
  { name: "Klara", searchNames: ["Klara"], special: true, region: "Galar" },
  { name: "Avery", searchNames: ["Avery"], special: true, region: "Galar" },
  { name: "Sordward", searchNames: ["Sordward"], special: true, region: "Galar" },
  { name: "Shielbert", searchNames: ["Shielbert"], special: true, region: "Galar" },
  { name: "The Masked Royal", searchNames: ["The Masked Royal"], special: true, region: "Galar" },
  { name: "Gloria", searchNames: ["Gloria"], special: true, region: "Galar" },
  // Mustard's cards are named "Rapid Strike Style Mustard" / "Single Strike Style Mustard" — no
  // possessive, so soloIndexName's stripping doesn't reduce them to "Mustard" alone; listed as
  // literal candidates instead of writing new parsing logic for this one case.
  { name: "Mustard", searchNames: ["Mustard", "Rapid Strike Style Mustard", "Single Strike Style Mustard"], special: true, region: "Galar" },
  // Paldea (Gen 9) named characters
  { name: "Katy", searchNames: ["Katy"], special: true, region: "Paldea" },
  { name: "Brassius", searchNames: ["Brassius"], special: true, region: "Paldea" },
  { name: "Iono", searchNames: ["Iono"], special: true, region: "Paldea" },
  { name: "Kofu", searchNames: ["Kofu"], special: true, region: "Paldea" },
  { name: "Larry", searchNames: ["Larry"], special: true, region: "Paldea" },
  { name: "Ryme", searchNames: ["Ryme"], special: true, region: "Paldea" },
  { name: "Tulip", searchNames: ["Tulip"], special: true, region: "Paldea" },
  { name: "Grusha", searchNames: ["Grusha"], special: true, region: "Paldea" },
  { name: "Rika", searchNames: ["Rika"], special: true, region: "Paldea" },
  { name: "Poppy", searchNames: ["Poppy"], special: true, region: "Paldea" },
  { name: "Hassel", searchNames: ["Hassel"], special: true, region: "Paldea" },
  { name: "Geeta", searchNames: ["Geeta"], special: true, region: "Paldea" },
  { name: "Nemona", searchNames: ["Nemona"], special: true, region: "Paldea" },
  { name: "O'Nare", searchNames: ["O'Nare", "O’Nare"], special: true, region: "Paldea" },
  // Tyme: Bulbapedia-tagged Gym Leader + Rock-type Trainer, from the Paldean Winds short.
  { name: "Tyme", searchNames: ["Tyme"], special: true, region: "Paldea" },
  { name: "Arven", searchNames: ["Arven"], special: true, region: "Paldea" },
  { name: "Penny", searchNames: ["Penny"], special: true, region: "Paldea" },
  { name: "Clavell", searchNames: ["Clavell"], special: true, region: "Paldea" },
  { name: "Jacq", searchNames: ["Jacq"], special: true, region: "Paldea" },
  { name: "Amarys", searchNames: ["Amarys"], special: true, region: "Paldea" },
  { name: "Giacomo", searchNames: ["Giacomo"], special: true, region: "Paldea" },
  { name: "Mela", searchNames: ["Mela"], special: true, region: "Paldea" },
  { name: "Atticus", searchNames: ["Atticus"], special: true, region: "Paldea" },
  { name: "Ortega", searchNames: ["Ortega"], special: true, region: "Paldea" },
  { name: "Eri", searchNames: ["Eri"], special: true, region: "Paldea" },
  // Kitakami/Blueberry Academy (Teal Mask / Indigo Disk DLC)
  { name: "Kieran", searchNames: ["Kieran"], special: true, region: "Paldea" },
  { name: "Carmine", searchNames: ["Carmine"], special: true, region: "Paldea" },
  { name: "Perrin", searchNames: ["Perrin"], special: true, region: "Paldea" },
  { name: "Briar", searchNames: ["Briar"], special: true, region: "Paldea" },
  { name: "Crispin", searchNames: ["Crispin"], special: true, region: "Paldea" },
  { name: "Lacey", searchNames: ["Lacey"], special: true, region: "Paldea" },
  { name: "Cara Liss", searchNames: ["Cara Liss"], special: true, region: "Galar" },
  { name: "Dendra", searchNames: ["Dendra"], special: true, region: "Paldea" },
  { name: "Gwynn", searchNames: ["Gwynn"], special: true, region: "Lumiose" },
  { name: "Iscan", searchNames: ["Iscan"], special: true, region: "Hisui" },
  { name: "Miriam", searchNames: ["Miriam"], special: true, region: "Paldea" },
  { name: "Morgan", searchNames: ["Morgan"], special: true, region: "Hoenn" },
  { name: "Naveen", searchNames: ["Naveen"], special: true, region: "Lumiose" },
  { name: "Raifort", searchNames: ["Raifort"], special: true, region: "Paldea" },
  { name: "Saguaro", searchNames: ["Saguaro"], special: true, region: "Paldea" },
  { name: "Salvatore", searchNames: ["Salvatore"], special: true, region: "Paldea" },
  { name: "Tarragon", searchNames: ["Tarragon"], special: true, region: "Lumiose" },
  { name: "Evelyn", searchNames: ["Evelyn"], special: true, region: "Hoenn" },
  { name: "Arezu", searchNames: ["Arezu"], special: true, region: "Hisui" },
  { name: "Honey", searchNames: ["Honey"], special: true, region: "Paldea" },
  { name: "Jacinthe", searchNames: ["Jacinthe"], special: true, region: "Lumiose" },
  { name: "Professor Sada", searchNames: ["Professor Sada", "Sada"], special: true, region: "Paldea" },
  { name: "Professor Turo", searchNames: ["Professor Turo", "Turo"], special: true, region: "Paldea" },
  { name: "Cassiopeia", searchNames: ["Cassiopeia"], special: true, region: "Paldea" },
  // Hisui (Legends: Arceus) named characters
  { name: "Professor Laventon", searchNames: ["Professor Laventon", "Laventon"], special: true, region: "Hisui" },
  { name: "Cyllene", searchNames: ["Cyllene"], special: true, region: "Hisui" },
  { name: "Adaman", searchNames: ["Adaman"], special: true, region: "Hisui" },
  { name: "Irida", searchNames: ["Irida"], special: true, region: "Hisui" },
  { name: "Volo", searchNames: ["Volo"], special: true, region: "Hisui" },
  { name: "Cogita", searchNames: ["Cogita"], special: true, region: "Hisui" },
  { name: "Kamado", searchNames: ["Kamado"], special: true, region: "Hisui" },
  { name: "Choy", searchNames: ["Choy"], special: true, region: "Hisui" },
  // Lumiose (Legends: Z-A) named characters. AZ already exists as a Kalos entry above and
  // returns in Z-A, so not duplicated here. Only Urbain and Jett confirmed against the card
  // catalog — other reported characters (Taunie, Vinnie) have no card yet.
  { name: "Urbain", searchNames: ["Urbain"], special: true, region: "Lumiose" },
  { name: "Canari", searchNames: ["Canari"], special: true, region: "Lumiose" },
  { name: "Philippe", searchNames: ["Philippe"], special: true, region: "Lumiose" },
  { name: "Jett", searchNames: ["Jett"], special: true, region: "Lumiose" },
  // Pokémon GO — the three Team Leaders, not tied to any mainline region.
  { name: "Blanche", searchNames: ["Blanche"], special: true, region: "Pokémon GO" },
  { name: "Candela", searchNames: ["Candela"], special: true, region: "Pokémon GO" },
  { name: "Spark", searchNames: ["Spark"], special: true, region: "Pokémon GO" },
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
  // Additional generic classes/ranks found in a full catalog sweep, missed the first pass
  { name: "Schoolboy", searchNames: ["Schoolboy"] },
  { name: "Schoolgirl", searchNames: ["Schoolgirl"] },
  { name: "Poké Kid", searchNames: ["Poké Kid", "Poke Kid"] },
  { name: "Roller Skater", searchNames: ["Roller Skater"] },
  { name: "Ruffian", searchNames: ["Ruffian"] },
  { name: "Sightseer", searchNames: ["Sightseer"] },
  { name: "TV Reporter", searchNames: ["TV Reporter"] },
  { name: "Traveling Merchant", searchNames: ["Traveling Merchant"] },
  { name: "Team Star Grunt", searchNames: ["Team Star Grunt"] },
  { name: "Team Aqua Admin", searchNames: ["Team Aqua Admin"] },
  { name: "Team Magma Admin", searchNames: ["Team Magma Admin"] },
  // Rust Syndicate: Legends: Z-A's villain faction, Bulbapedia-confirmed as a real trainer class.
  { name: "Rust Syndicate Grunt", searchNames: ["Rust Syndicate Grunt"] },
];

// The point of the Trainers page is one tile per trainer, not one per card — pokemontcg.io
// names most Supporter cards after their signature move ("Bill's Analysis", "Bill's
// Maintenance", "Bill's Transfer"), so the possessive prefix is the trainer's actual name.
function soloIndexName(cardName: string): string {
  const noVariantTag = cardName.replace(/\s*\([^)]*\)\s*$/, "");
  // Both apostrophe variants matter here — vintage Gym Heroes/Gym Challenge card names (e.g.
  // "Bill's Maintenance", "Brock's Grit", "Sabrina's Suggestion") use a typographic curly
  // apostrophe (’, U+2019) in pokemontcg.io's data, not the straight one ('). Only matching
  // straight quotes silently failed every one of these vintage possessive cards — they never
  // stripped down to the trainer's name and so never matched their roster entry at all.
  const possessiveMatch = noVariantTag.match(/^(.+?)['’]s\s+.+$/);
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
  const names: string[] = [];
  // "Professor's Research (Professor Magnolia)" — a shared card template reused across every
  // region, where the parenthetical is the actual identifying info (which professor), not a
  // disambiguating variant tag. soloIndexName's trailing-parenthetical strip treats it as noise
  // and collapses every one of these to generic "Professor's Research" -> "professor", so none
  // of them ever matched their specific professor's roster entry.
  const professorMatch = cardName.match(/^Professor['’]?s Research \((?:Professor\s+)?(.+)\)$/i);
  if (professorMatch) {
    const person = professorMatch[1].trim();
    names.push(person.toLowerCase(), `professor ${person}`.toLowerCase());
  }
  // "Boss's Orders (Ghetsis)" / "Boss's Orders (Giovanni)" — same shared-template shape as
  // Professor's Research above (identity is in the parenthetical, not the card name itself),
  // used for whichever team's leader/boss appears. Without this, every team leader's own
  // signature Supporter card collapsed to generic "boss" and never matched their roster entry.
  const bossMatch = cardName.match(/^Boss['’]s Orders \((.+)\)$/i);
  if (bossMatch) {
    names.push(bossMatch[1].trim().toLowerCase());
  }
  const noVariantTag = cardName.replace(/\s*\([^)]*\)\s*$/, "");
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

// Same rate-limit queue pattern as pocketapi.ts — with 300+ trainers now, every miss firing an
// unthrottled TCGdex request at once (150+ concurrent) is a likely cause of the request
// failures/rate-limiting seen in recent regens, on top of the fetchAllPages pagination bug.
const MAX_CONCURRENT_TCGDEX = 20;
let _tcgdexActive = 0;
const _tcgdexQueue: Array<() => void> = [];
function withTcgdexRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      _tcgdexActive++;
      fn().then(resolve, reject).finally(() => {
        _tcgdexActive--;
        if (_tcgdexQueue.length > 0) _tcgdexQueue.shift()!();
      });
    };
    if (_tcgdexActive < MAX_CONCURRENT_TCGDEX) run();
    else _tcgdexQueue.push(run);
  });
}

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
  return withTcgdexRateLimit(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
        const res = await fetch(url, { next: { revalidate: 86400 } } as RequestInit);
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch { /* retry */ }
    }
    return null;
  });
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

const BULBAPEDIA_API = "https://bulbapedia.bulbagarden.net/w/api.php";

// Last-resort art source for trainers with zero TCG/Pocket card of their own — mirrors the
// Pokédex's PokeAPI official-artwork fallback for Pokémon with no matching card. Bulbapedia isn't
// reachable from the sandbox this code is edited in, but is reachable from the CI runner that
// actually executes this at data-generation time (confirmed separately). "(game)" is Bulbapedia's
// usual disambiguator when a named trainer's plain name collides with another article (e.g. an
// anime character or move of the same name); "(Trainer class)" is the equivalent disambiguator
// Bulbapedia uses for generic trainer-class pages (e.g. "Skier (Trainer class)"), which is why
// generic classes need it tried too, not just named individuals. redirects=1 handles the common
// case where the plain title is itself a redirect to the disambiguated page.
async function fetchBulbapediaArtwork(name: string): Promise<string | null> {
  for (const title of [name, `${name} (game)`, `${name} (Trainer class)`]) {
    try {
      const url = `${BULBAPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&format=json&redirects=1`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const page = Object.values(json?.query?.pages ?? {})[0] as { missing?: unknown; original?: { source?: string } } | undefined;
      if (!page || page.missing !== undefined) continue;
      if (page.original?.source) return page.original.source;
    } catch {
      // try next candidate title
    }
  }
  return null;
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

  const entries = await Promise.all(
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
      // Generic trainer classes (Youngster, Sailor, etc.) get a Bulbapedia lookup too — they
      // have their own "X (Trainer class)" pages with official art, same as named individuals.
      if (!imageUrl) {
        imageUrl = await fetchBulbapediaArtwork(name);
        // Character art, not a bordered TCG card — same full-bleed treatment as a full-art card.
        isFullArt = imageUrl !== null;
      }
      // Generic trainer classes (Youngster, Sailor, etc.) aren't region-specific — every region
      // has its own Youngsters and Sailors — so only named individuals get a real region tag,
      // defaulting to Kanto when not overridden (Johto entries set region explicitly).
      return {
        name,
        slug: toTrainerSlug(name),
        region: region ?? (special ? "Kanto" : "Universal"),
        roles: special ? assignRolesFor(name) : ["Trainer Class"],
        imageUrl,
        isFullArt,
      };
    })
  );
  return entries.sort((a, b) => {
    const regionDiff = REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region);
    if (regionDiff !== 0) return regionDiff;
    const roleDiff = bestRoleRank(a.roles) - bestRoleRank(b.roles);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name);
  });
}
