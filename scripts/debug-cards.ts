#!/usr/bin/env tsx
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

interface PtcgCard {
  name: string;
}

async function fetchAllPtcgTrainerCards(): Promise<string[]> {
  const names: string[] = [];
  let page = 1;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent("supertype:Trainer")}&pageSize=250&page=${page}&select=name`;
    let data: PtcgCard[] | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        data = json.data ?? [];
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!data) break;
    names.push(...data.map((c) => c.name));
    if (data.length < 250) break;
    page++;
  }
  return names;
}

interface TcgdexBriefCard {
  id: string;
  name: string;
}

async function fetchAllTcgdexCardIds(): Promise<TcgdexBriefCard[]> {
  const res = await fetch(`${TCGDEX_BASE}/cards`);
  if (!res.ok) return [];
  return (await res.json()) as TcgdexBriefCard[];
}

interface TcgdexCard {
  id: string;
  name: string;
  category?: string;
  trainerType?: string;
}

async function fetchTcgdexDetail(id: string): Promise<TcgdexCard | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
      if (!res.ok) return null;
      return (await res.json()) as TcgdexCard;
    } catch {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function soloIndexName(cardName: string): string {
  const noVariantTag = cardName.replace(/\s*\([^)]*\)\s*$/, "");
  const possessiveMatch = noVariantTag.match(/^(.+?)['']s\s+.+$/);
  return (possessiveMatch ? possessiveMatch[1] : noVariantTag).toLowerCase();
}

const ORG_POSSESSIVE_PREFIXES = ["Team Rocket", "Team Aqua", "Team Magma", "Team Galactic", "Team Plasma", "Team Flare", "Team Skull", "Team Yell"];

function extractNames(cardName: string): string[] {
  const names: string[] = [soloIndexName(cardName)];
  const professorMatch = cardName.match(/^Professor'?s Research \((?:Professor\s+)?(.+)\)$/i);
  if (professorMatch) {
    names.push(professorMatch[1].trim().toLowerCase());
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

function loadRosterSearchNames(): Set<string> {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const names = new Set<string>();
  const re = /searchNames:\s*\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const nameMatch of m[1].matchAll(/"([^"]+)"/g)) {
      names.add(nameMatch[1].toLowerCase());
    }
  }
  return names;
}

async function main() {
  console.log("Fetching pokemontcg.io Trainer cards...");
  const ptcgNames = await fetchAllPtcgTrainerCards();
  console.log(`Got ${ptcgNames.length} paper TCG trainer cards`);

  console.log("Fetching TCGdex full card list...");
  const brief = await fetchAllTcgdexCardIds();
  console.log(`Got ${brief.length} TCGdex cards total, fetching details...`);
  const details = await mapLimit(brief, 20, (c) => fetchTcgdexDetail(c.id));
  const pocketSupporterNames = details
    .filter((d): d is TcgdexCard => !!d && d.category === "Trainer" && d.trainerType === "Supporter")
    .map((d) => d.name);
  console.log(`Got ${pocketSupporterNames.length} Pocket Supporter cards`);

  const allCardNames = [...ptcgNames, ...pocketSupporterNames];
  const extractedNameCounts = new Map<string, number>();
  for (const cardName of allCardNames) {
    for (const n of extractNames(cardName)) {
      extractedNameCounts.set(n, (extractedNameCounts.get(n) ?? 0) + 1);
    }
  }

  const rosterNames = loadRosterSearchNames();
  const missing: { name: string; count: number }[] = [];
  for (const [name, count] of extractedNameCounts) {
    if (!rosterNames.has(name)) missing.push({ name, count });
  }
  missing.sort((a, b) => b.count - a.count);

  writeFileSync(
    join(import.meta.dirname, "../lib/debug-cards.json"),
    JSON.stringify(
      {
        ptcgCount: ptcgNames.length,
        tcgdexTotalCount: brief.length,
        pocketSupporterCount: pocketSupporterNames.length,
        totalExtractedNames: extractedNameCounts.size,
        missingCount: missing.length,
        missing,
      },
      null,
      2
    )
  );
  console.log(`done — ${missing.length} unmatched names out of ${extractedNameCounts.size} extracted`);
}

main();
