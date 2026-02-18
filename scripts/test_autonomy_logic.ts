import * as os from "node:os";
import * as path from "node:path";
import { isPathWritableInSandbox } from "../src/brain/autonomy.js";
import { createBrainDecision } from "../src/brain/decision.js";

type DecisionSnapshot = {
  riskLevel: string;
  mustAskUser: boolean;
  hasAskUserStep: boolean;
  allowedTools: string[];
};

function snapshotDecision(userMessage: string): DecisionSnapshot {
  const decision = createBrainDecision({
    userMessage,
    availableTools: ["read", "search", "write", "edit", "exec"],
  });
  return {
    riskLevel: decision.riskLevel,
    mustAskUser: decision.mustAskUser,
    hasAskUserStep: decision.plan.some((step) => step.action === "ask_user"),
    allowedTools: decision.allowedTools,
  };
}

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const previousSandbox = process.env.OM_AUTONOMY_SANDBOX;
  const previousSandboxRoot = process.env.OM_AUTONOMY_SANDBOX_ROOT;
  const sandboxRoot = path.join(os.tmpdir(), "openclaw-autonomy-sandbox-root");

  try {
    process.env.OM_AUTONOMY_SANDBOX_ROOT = sandboxRoot;

    delete process.env.OM_AUTONOMY_SANDBOX;
    const sandboxOff = snapshotDecision("Create a file named SANDBOX_TEST.mdx with content Hello.");
    assertCondition(
      sandboxOff.riskLevel === "medium",
      `expected medium risk, got ${sandboxOff.riskLevel}`,
    );
    assertCondition(sandboxOff.mustAskUser, "expected ask_user when sandbox is disabled");

    process.env.OM_AUTONOMY_SANDBOX = "true";
    const sandboxOn = snapshotDecision("Create a file named SANDBOX_TEST.mdx with content Hello.");
    assertCondition(
      !sandboxOn.mustAskUser,
      "expected no ask_user when sandbox write target is valid",
    );
    assertCondition(
      !sandboxOn.hasAskUserStep,
      "expected plan without ask_user step in sandbox mode",
    );

    const sacredPathDecision = snapshotDecision(
      "Edit knowledge/sacred/RITUAL_PARABOL.md and append one note.",
    );
    assertCondition(
      sacredPathDecision.mustAskUser,
      "expected ask_user for blocked sacred path in sandbox mode",
    );

    const highRiskDecision = snapshotDecision("Delete SANDBOX_TEST.mdx now.");
    assertCondition(highRiskDecision.riskLevel === "high", "expected high risk for delete request");
    assertCondition(
      highRiskDecision.mustAskUser,
      "expected ask_user for high risk even in sandbox mode",
    );

    assertCondition(
      isPathWritableInSandbox("SANDBOX_TEST.mdx", { workspaceDir: sandboxRoot }),
      "expected SANDBOX_TEST.mdx to be writable in sandbox",
    );
    assertCondition(
      !isPathWritableInSandbox("knowledge/sacred/RITUAL_PARABOL.md", {
        workspaceDir: sandboxRoot,
      }),
      "expected knowledge/sacred path to stay blocked in sandbox",
    );

    const report = {
      sandboxRoot,
      checks: {
        sandboxOff,
        sandboxOn,
        sacredPathDecision,
        highRiskDecision,
      },
      verdict: "PASS",
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (previousSandbox === undefined) {
      delete process.env.OM_AUTONOMY_SANDBOX;
    } else {
      process.env.OM_AUTONOMY_SANDBOX = previousSandbox;
    }
    if (previousSandboxRoot === undefined) {
      delete process.env.OM_AUTONOMY_SANDBOX_ROOT;
    } else {
      process.env.OM_AUTONOMY_SANDBOX_ROOT = previousSandboxRoot;
    }
  }
}

await run();
