
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

async function analyze() {
  const telemetryPath = path.join(os.homedir(), ".openclaw", "workspace", "OM_TELEMETRY.jsonl");
  const content = await fs.readFile(telemetryPath, "utf-8");
  const lines = content.trim().split("\n");

  let heartbeatCount = 0;
  let gibbsEvalCount = 0;
  let totalEvaluatedNodes = 0;
  let totalDistortionCount = 0;
  let totalEruptionCandidates = 0;
  
  const transitions = {
    stableToDistortion: 0,
    distortionToEruption: 0,
    eruptionToDistortion: 0,
    distortionToStable: 0
  };

  const trinityScores: number[] = [];
  const mismatchClasses: Record<string, number> = {};

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.event === "SUMMARY" && data.layer === "HEARTBEAT") {
        heartbeatCount++;
      }
      if (data.event === "GIBBS_EVAL" && data.layer === "BRAIN-GIBBS") {
        gibbsEvalCount++;
        totalEvaluatedNodes += data.evaluatedCount || 0;
        totalDistortionCount += data.distortionCount || 0;
        if (data.eruptionCandidate) totalEruptionCandidates++;
        
        if (data.transitions) {
          transitions.stableToDistortion += data.transitions.stableToDistortion || 0;
          transitions.distortionToEruption += data.transitions.distortionToEruption || 0;
          transitions.eruptionToDistortion += data.transitions.eruptionToDistortion || 0;
          transitions.distortionToStable += data.transitions.distortionToStable || 0;
        }
      }
      if (data.event === "TRINITY_COHERENCE") {
        if (typeof data.score === 'number') trinityScores.push(data.score);
        if (data.mismatchClass) {
          mismatchClasses[data.mismatchClass] = (mismatchClasses[data.mismatchClass] || 0) + 1;
        }
      }
    } catch (e) {
      // skip invalid lines
    }
  }

  const avgTrinityScore = trinityScores.length > 0 
    ? trinityScores.reduce((a, b) => a + b, 0) / trinityScores.length 
    : 0;

  const report = {
    heartbeatCount,
    gibbsEvalCount,
    avgEvaluatedNodes: gibbsEvalCount > 0 ? totalEvaluatedNodes / gibbsEvalCount : 0,
    avgDistortionCount: gibbsEvalCount > 0 ? totalDistortionCount / gibbsEvalCount : 0,
    eruptionCandidateRate: gibbsEvalCount > 0 ? totalEruptionCandidates / gibbsEvalCount : 0,
    transitions,
    avgTrinityScore,
    mismatchClasses
  };

  console.log(JSON.stringify(report, null, 2));
}

analyze().catch(console.error);
