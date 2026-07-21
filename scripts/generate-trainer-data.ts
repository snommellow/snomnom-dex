#!/usr/bin/env tsx
import { writeFileSync } from "fs";
import { join } from "path";
import { fetchTrainerEntries } from "../lib/trainerapi";

async function main() {
  console.log("Fetching trainer Supporter cards...");
  const trainers = await fetchTrainerEntries();
  console.log(`Found ${trainers.length} trainers.`);
  writeFileSync(join(import.meta.dirname, "../lib/trainer-data.json"), JSON.stringify(trainers, null, 2));
  console.log("done");
}

main();
