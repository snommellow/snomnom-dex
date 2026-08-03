#!/usr/bin/env tsx
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";

const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

function getHeaders(): HeadersInit {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

interface PtcgCard {
  id: string;
  name: string;
  rules?: string[];
  attacks?: { text?: string }[];
}

async function fetchAllPages(q: string): Promise<PtcgCard[]> {
  const results: PtcgCard[] = [];
  let page = 1;
  let totalCount: number | null = null;
  while (true) {
    const url = `${PTCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=250&page=${page}&select=id,name,rules`;
    let data: PtcgCard[] | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        data = json.data ?? [];
        if (typeof json.totalCount === "number") totalCount = json.totalCount;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (!data) break;
    results.push(...data);
    if (data.length < 250) break;
    if (totalCount !== null && results.length >= totalCount) break;
    page++;
  }
  return results;
}

interface RosterEntry {
  name: string;
  region: string;
}

function loadRoster(): RosterEntry[] {
  const src = readFileSync(join(import.meta.dirname, "../lib/trainerapi.ts"), "utf-8");
  const entries: RosterEntry[] = [];
  const re = /\{\s*name:\s*"([^"]+)"[^}]*?special:\s*true[^}]*?region:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) entries.push({ name: m[1], region: m[2] });
  return entries;
}

function main() {
  return (async () => {
    const roster = loadRoster();
    const nameToRegion = new Map(roster.map((r) => [r.name.toLowerCase(), r.region]));
    const rosterNames = roster.map((r) => r.name);

    console.log("Fetching all Trainer cards with rules text...");
    const cards = await fetchAllPages("supertype:Trainer");
    console.log(`Got ${cards.length} cards`);

    // Union-find over roster names, linked whenever a single card's text mentions 2+ of them.
    const parent = new Map<string, string>();
    function find(x: string): string {
      if (!parent.has(x)) parent.set(x, x);
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      parent.set(x, root);
      return root;
    }
    function union(a: string, b: string) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }

    const evidence: Record<string, string[]> = {};

    for (const card of cards) {
      const text = [card.name, ...(card.rules ?? [])].join(" \n ");
      const mentioned = rosterNames.filter((n) => {
        const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        return re.test(text);
      });
      if (mentioned.length >= 2) {
        for (let i = 1; i < mentioned.length; i++) union(mentioned[0], mentioned[i]);
        const key = mentioned.slice().sort().join(", ");
        (evidence[key] ??= []).push(card.name);
      }
    }

    // Group by root, report any group whose members don't all share the same region.
    const groups = new Map<string, string[]>();
    for (const name of rosterNames) {
      const root = find(name);
      (groups.get(root) ?? groups.set(root, []).get(root)!).push(name);
    }

    const mismatches: { members: { name: string; region: string }[]; evidenceCards: string[] }[] = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const regions = new Set(members.map((n) => nameToRegion.get(n.toLowerCase())));
      if (regions.size > 1) {
        const evidenceCards = Object.entries(evidence)
          .filter(([key]) => members.some((m) => key.includes(m)))
          .flatMap(([, cards]) => cards);
        mismatches.push({
          members: members.map((n) => ({ name: n, region: nameToRegion.get(n.toLowerCase())! })),
          evidenceCards: [...new Set(evidenceCards)],
        });
      }
    }

    writeFileSync(
      join(import.meta.dirname, "../lib/debug-region-groups.json"),
      JSON.stringify({ totalGroups: groups.size, mismatches }, null, 2)
    );
    console.log(`done — ${mismatches.length} region-inconsistent groups found`);
  })();
}

main();
