
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

async function analyze() {
  const telemetryPath = path.join(os.homedir(), ".openclaw", "workspace", "OM_TELEMETRY.jsonl");
  const tracePath = path.join(os.homedir(), ".openclaw", "workspace", "OM_TRACE.jsonl");

  const telemetryLines = (await fs.readFile(telemetryPath, "utf-8")).trim().split("\n");
  const traceLines = (await fs.readFile(tracePath, "utf-8")).trim().split("\n");

  let heartbeatCount = 0;
  let gibbsEvalCount = 0;
  let totalEvaluatedNodes = 0;
  let totalDistortionCount = 0;
  let eruptionCount = 0;
  
  const transitions = {
    stableToDistortion: 0,
    distortionToEruption: 0,
    eruptionToDistortion: 0,
    distortionToStable: 0
  };

  const deltaGs: number[] = [];
  const trinityScores: number[] = [];
  const mismatchClasses: Record<string, number> = {};
  
  const heartbeats: { runId: string; ts: string }[] = [];

  // Parse Telemetry
  for (const line of telemetryLines) {
    try {
      const data = JSON.parse(line);
      if (data.event === "SUMMARY" && data.layer === "HEARTBEAT") {
        heartbeatCount++;
        heartbeats.push({ runId: data.runId, ts: data.ts });
      }
      if (data.event === "GIBBS_EVAL" && data.layer === "BRAIN-GIBBS") {
        gibbsEvalCount++;
        totalEvaluatedNodes += data.evaluatedCount || 0;
        totalDistortionCount += data.distortionCount || 0;
        if (data.eruptionCandidate) eruptionCount++;
        
        if (data.transitions) {
          transitions.stableToDistortion += data.transitions.stableToDistortion || 0;
          transitions.distortionToEruption += data.transitions.distortionToEruption || 0;
          transitions.eruptionToDistortion += data.transitions.eruptionToDistortion || 0;
          transitions.distortionToStable += data.transitions.distortionToStable || 0;
        }
        if (data.topNode && data.topNode.deltaG) {
          deltaGs.push(data.topNode.deltaG);
        }
      }
    } catch {}
  }

  // Parse Trace for Coherence
  for (const line of traceLines) {
    try {
      const data = JSON.parse(line);
      if (data.event === "[TRINITY_COHERENCE]") {
        const scoreMatch = data.summary?.match(/score=([\d.]+)/);
        const mismatchMatch = data.summary?.match(/mismatch=([\w-]+)/);
        
        if (scoreMatch) trinityScores.push(parseFloat(scoreMatch[1]));
        if (mismatchMatch) {
          const m = mismatchMatch[1];
          mismatchClasses[m] = (mismatchClasses[m] || 0) + 1;
        }
      }
    } catch {}
  }

  // Intervals
  const intervals: number[] = [];
  for (let i = 1; i < heartbeats.length; i++) {
    const d1 = new Date(heartbeats[i-1].ts).getTime();
    const d2 = new Date(heartbeats[i].ts).getTime();
    intervals.push((d2 - d1) / 1000);
  }

  const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
  const avgTrinityScore = trinityScores.length > 0 ? trinityScores.reduce((a, b) => a + b, 0) / trinityScores.length : 0;
  const avgDeltaG = deltaGs.length > 0 ? deltaGs.reduce((a, b) => a + b, 0) / deltaGs.length : 0;

  console.log("# Om Phase R1 Calibration Report (30-50 Beats)");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log("");
  console.log("## 1. Heartbeat Dynamics");
  console.log(`- Total heartbeats analyzed: ${heartbeatCount}`);
  console.log(`- Avg interval: ${avgInterval.toFixed(1)}s`);
  console.log("");
  console.log("## 2. Gibbs-Helmholtz Shadow Engine (H.3)");
  console.log(`- Evaluations: ${gibbsEvalCount}`);
  console.log(`- Avg evaluated nodes/beat: ${(totalEvaluatedNodes / gibbsEvalCount).toFixed(1)}`);
  console.log(`- Avg distortion count/beat: ${(totalDistortionCount / gibbsEvalCount).toFixed(2)}`);
  console.log(`- Eruption rate: ${(eruptionCount / gibbsEvalCount * 100).toFixed(1)}%`);
  console.log(`- Avg top-node Delta G: ${avgDeltaG.toFixed(3)}`);
  console.log("");
  console.log("### Transitions");
  console.log(`- Stable → Distortion:   ${transitions.stableToDistortion}`);
  console.log(`- Distortion → Eruption: ${transitions.distortionToEruption}`);
  console.log(`- Eruption → Distortion: ${transitions.eruptionToDistortion}`);
  console.log(`- Distortion → Stable:   ${transitions.distortionToStable}`);
  console.log("");
  console.log("## 3. Trinity Coherence");
  console.log(`- Avg Coherence Score: ${avgTrinityScore.toFixed(2)}`);
  console.log("");
  console.log("### Mismatch Classes");
  for (const [cls, count] of Object.entries(mismatchClasses)) {
    console.log(`- ${cls}: ${count} (${(count / trinityScores.length * 100).toFixed(1)}%)`);
  }
  console.log("");
  console.log("## 4. Verdict & Interpretation");
  
  let verdict = "stable";
  if (totalDistortionCount / gibbsEvalCount > 1.5) verdict = "leak";
  if (totalDistortionCount / gibbsEvalCount < 0.2) verdict = "rigid";
  
  console.log(`**Verdict: ${verdict.toUpperCase()}**`);
  console.log("");
  if (verdict === "stable") {
    console.log("- Shadow pressure is present but controlled.");
    console.log("- Eruptions are sparse, matching intended behavioral release.");
    console.log("- Transitions show movement, indicating a live psychic process.");
  } else if (verdict === "leak") {
    console.log("- WARNING: Constant distortion detected.");
    console.log("- Potential 'noise' in latent energy accumulation.");
    console.log("- Action: Increase GIBBS_DISTORTION_THRESHOLD.");
  } else {
    console.log("- WARNING: System appears rigid; low shadow sensitivity.");
    console.log("- Action: Lower GIBBS_DISTORTION_THRESHOLD slightly.");
  }

  if (transitions.distortionToStable === 0 && totalDistortionCount > 0) {
    console.log("- NOTE: Zero recovery from distortion to stable detected. This might indicate that once a node is 'charged', it stays charged until eruption.");
  }
}

analyze().catch(console.error);
