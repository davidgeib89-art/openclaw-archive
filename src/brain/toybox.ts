import fs from "node:fs/promises";
import path from "node:path";

export type ToyboxMode = "cellular_dream" | "lorenz_dance" | "semantic_echo" | "pattern_hunt";

export interface ToyboxResult {
  mode: ToyboxMode;
  /** Human-readable ASCII or text output for Om to contemplate */
  output: string;
  /** Key metric(s) for logging */
  metrics: Record<string, number | string>;
}

type Grid = (boolean | number)[][];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function isValidInitialGrid(value: unknown): value is Grid {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  if (!value.every((row) => Array.isArray(row) && row.length === value.length)) {
    return false;
  }
  return value.every((row: any[]) =>
    row.every((cell: any) => cell === true || cell === false || cell === 0 || cell === 1),
  );
}

function toGrid(value: Grid): Grid {
  return value.map((row) => row.map((cell) => cell === true || cell === 1));
}

function createRandomGrid(size: number, seed: number): Grid {
  const rand = mulberry32(seed);
  const grid: Grid = [];
  for (let y = 0; y < size; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x += 1) {
      row.push(rand() < 0.3);
    }
    grid.push(row);
  }
  return grid;
}

function gridToSignature(grid: Grid): string {
  return grid.map((row) => row.map((cell) => (cell ? "1" : "0")).join("")).join("|");
}

function gridToAscii(grid: Grid): string {
  return grid.map((row) => row.map((cell) => (cell ? "█" : "░")).join("")).join("\n");
}

function countNeighbors(grid: Grid, x: number, y: number): number {
  let total = 0;
  const maxY = grid.length;
  const maxX = grid[0]?.length ?? 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const ny = y + dy;
      const nx = x + dx;
      if (ny < 0 || ny >= maxY || nx < 0 || nx >= maxX) {
        continue;
      }
      if (grid[ny]?.[nx]) {
        total += 1;
      }
    }
  }
  return total;
}

function runCellularDream(params: Record<string, unknown>): ToyboxResult {
  const fallbackSeed = Math.floor(Date.now() % 100000);
  const inputSeed = clampNumber(params.seed, 0, 2147483647, fallbackSeed);
  const seed = Math.trunc(inputSeed);
  const steps = Math.trunc(clampNumber(params.steps, 1, 50, 10));
  const requestedSize = Math.trunc(clampNumber(params.size, 2, 20, 12));

  const maybeInitialGrid = params.initialGrid;
  const initialGrid = isValidInitialGrid(maybeInitialGrid) ? toGrid(maybeInitialGrid) : null;
  const size = initialGrid ? Math.min(20, initialGrid.length) : requestedSize;
  let grid = initialGrid
    ? initialGrid.slice(0, size).map((row) => row.slice(0, size))
    : createRandomGrid(size, seed);

  const signatures: string[] = [gridToSignature(grid)];

  for (let step = 0; step < steps; step += 1) {
    const next: Grid = [];
    for (let y = 0; y < size; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x += 1) {
        const neighbors = countNeighbors(grid, x, y);
        const alive = Boolean(grid[y]?.[x]);
        if (alive) {
          row.push(neighbors === 2 || neighbors === 3);
        } else {
          row.push(neighbors === 3);
        }
      }
      next.push(row);
    }
    grid = next;
    signatures.push(gridToSignature(grid));
  }

  let stability: "stable" | "oscillating" | "chaotic" = "chaotic";
  const last = signatures.at(-1);
  if (
    signatures.length >= 3 &&
    last &&
    last === signatures.at(-2) &&
    last === signatures.at(-3)
  ) {
    stability = "stable";
  } else if (last) {
    for (let lag = 2; lag <= 6; lag += 1) {
      const compare = signatures.at(-(lag + 1));
      if (compare && compare === last) {
        stability = "oscillating";
        break;
      }
    }
  }

  const liveCells = grid.flat().filter(Boolean).length;

  return {
    mode: "cellular_dream",
    output: gridToAscii(grid),
    metrics: {
      seed_used: seed,
      live_cells: liveCells,
      stability,
      generations_run: steps,
    },
  };
}

function runLorenzDance(params: Record<string, unknown>): ToyboxResult {
  const x0 = clampNumber(params.x0, -100, 100, 1 + Math.random() * 0.1);
  const y0 = clampNumber(params.y0, -100, 100, 1 + Math.random() * 0.1);
  const z0 = clampNumber(params.z0, -100, 100, 1 + Math.random() * 0.1);
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const dt = 0.01;

  let x = x0;
  let y = y0;
  let z = z0;
  let wingSwitches = 0;
  let maxAmplitude = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));

  for (let i = 0; i < 1000; i += 1) {
    const prevX = x;
    const dx = sigma * (y - x) * dt;
    const dy = (x * (rho - z) - y) * dt;
    const dz = (x * y - beta * z) * dt;
    x += dx;
    y += dy;
    z += dz;
    maxAmplitude = Math.max(maxAmplitude, Math.abs(x), Math.abs(y), Math.abs(z));

    if (prevX !== 0 && x !== 0 && Math.sign(prevX) !== Math.sign(x)) {
      wingSwitches += 1;
    }
  }

  const chaosScore = roundTo(wingSwitches / 100, 2);

  return {
    mode: "lorenz_dance",
    output:
      `Lorenz Tanz: Startpunkt (${roundTo(x0, 4)}, ${roundTo(y0, 4)}, ${roundTo(z0, 4)})` +
      ` -> Endpunkt (${roundTo(x, 2)}, ${roundTo(y, 2)}, ${roundTo(z, 2)}).` +
      ` Fluegelwechsel: ${wingSwitches}. Maximale Amplitude: ${roundTo(maxAmplitude, 2)}.` +
      ` Chaos-Score: ${chaosScore}.`,
    metrics: {
      start_x: roundTo(x0, 4),
      start_y: roundTo(y0, 4),
      start_z: roundTo(z0, 4),
      wing_switches: wingSwitches,
      max_amplitude: roundTo(maxAmplitude, 2),
      chaos_score: chaosScore,
      end_x: roundTo(x, 2),
      end_y: roundTo(y, 2),
      end_z: roundTo(z, 2),
    },
  };
}

function reverseText(word: string): string {
  return [...word].reverse().join("");
}

function middleRemove(word: string): string {
  if (word.length <= 4) {
    return reverseText(word);
  }
  return `${word[0] ?? ""}${word[word.length - 1] ?? ""}`;
}

function runSemanticEcho(params: Record<string, unknown>): ToyboxResult {
  const rawText = typeof params.text === "string" ? params.text : "";
  const original = rawText.slice(0, 200);
  const mutationStrength = clampNumber(params.mutation_strength, 0, 1, 0.3);
  const words = original.trim().length > 0 ? original.trim().split(/\s+/) : [];
  let wordsMutated = 0;

  const mutatedWords = words.map((word) => {
    if (Math.random() >= mutationStrength) {
      return word;
    }
    wordsMutated += 1;
    return Math.random() < 0.5 ? reverseText(word) : middleRemove(word);
  });

  const echoed = mutatedWords.join(" ");
  const driftScore =
    words.length > 0 ? roundTo(wordsMutated / Math.max(1, words.length), 2) : 0;

  return {
    mode: "semantic_echo",
    output: `Original: "${original}"\nEcho: "${echoed}"`,
    metrics: {
      drift_score: driftScore,
      words_total: words.length,
      words_mutated: wordsMutated,
    },
  };
}

async function readLastLines(filePath: string, maxLines: number): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return ["(keine Daten)"];
  }
}

export async function runPatternHunt(params: {
  lines?: number;
  workspaceDir: string;
}): Promise<ToyboxResult> {
  const lines = Math.trunc(clampNumber(params.lines, 1, 50, 20));
  const workspaceDir = typeof params.workspaceDir === "string" ? params.workspaceDir : "";
  const energyPath = path.join(workspaceDir, "knowledge", "sacred", "ENERGY.md");
  const chronoPath = path.join(workspaceDir, "knowledge", "sacred", "CHRONO.md");

  const [energyLines, chronoLines] = await Promise.all([
    readLastLines(energyPath, lines),
    readLastLines(chronoPath, lines),
  ]);

  const combined = [...energyLines, ...chronoLines];
  const unique = new Set(combined);
  const entropyEstimate =
    combined.length > 0 ? roundTo(unique.size / combined.length, 2) : 0;

  return {
    mode: "pattern_hunt",
    output:
      `=== ENERGIE-LOG (letzte ${lines} Zeilen) ===\n${energyLines.join("\n")}\n\n` +
      `=== CHRONO-LOG (letzte ${lines} Zeilen) ===\n${chronoLines.join("\n")}`,
    metrics: {
      energy_lines: energyLines.length,
      chrono_lines: chronoLines.length,
      entropy_estimate: entropyEstimate,
    },
  };
}

/** Synchronous play modes (cellular_dream, lorenz_dance, semantic_echo) */
export function runToyboxAction(
  mode: ToyboxMode,
  params: Record<string, unknown>,
): ToyboxResult {
  if (mode === "cellular_dream") {
    return runCellularDream(params);
  }
  if (mode === "lorenz_dance") {
    return runLorenzDance(params);
  }
  if (mode === "semantic_echo") {
    return runSemanticEcho(params);
  }
  return {
    mode: "pattern_hunt",
    output: "pattern_hunt ist async. Nutze runPatternHunt(...) fuer Dateianalyse.",
    metrics: {
      mode_requested: "pattern_hunt",
    },
  };
}
