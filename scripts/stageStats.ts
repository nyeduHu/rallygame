// scripts/stageStats.ts
import { ROAD, SEED } from "../lib/game/constants";
import { createRng, deriveSeed } from "../lib/game/random";
import { generateRoadLayout } from "../lib/game/stage/roadLayout";
import { difficultyScore, STAGE_CHECKS, type StageCandidate } from "../lib/game/stage/validateStage";

const SEED_COUNT = 300;
/** Mirrors generateStage's layout salt; kept local so the script can inspect raw attempts. */
const LAYOUT_SALT = 1;

/** Builds the validation candidate for a raw layout attempt. */
function candidateFor(seed: number, attempt: number): StageCandidate {
  const layout = generateRoadLayout(createRng(deriveSeed(deriveSeed(seed, LAYOUT_SALT), attempt)));
  const length = layout.samples[layout.samples.length - 1].s;
  const startS = ROAD.START_LINE_OFFSET;
  const finishS = length - ROAD.FINISH_LINE_OFFSET;
  const checkpointS = Array.from({ length: ROAD.CHECKPOINT_COUNT }, (_, k) => startS + ((finishS - startS) * (k + 1)) / (ROAD.CHECKPOINT_COUNT + 1));
  return { samples: layout.samples, corners: layout.corners, startS, finishS, checkpointS, length };
}

const failures: Record<string, number> = {};
const scores: number[] = [];
for (let seed = 1; seed <= SEED_COUNT; seed++) {
  const candidate = candidateFor(seed, 0);
  scores.push(difficultyScore(candidate));
  for (const check of STAGE_CHECKS) {
    if (!check.run(candidate, 0).ok) failures[check.name] = (failures[check.name] ?? 0) + 1;
  }
}
scores.sort((a, b) => a - b);
console.log("first-attempt failures per check:", failures);
console.log("difficulty percentiles 5/25/50/75/95:", [0.05, 0.25, 0.5, 0.75, 0.95].map((p) => scores[Math.floor(p * (scores.length - 1))]).join(" "));
console.log("seed cap", SEED.MAX_RANDOM_SEED);
