import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWritableInSandbox } from "./autonomy.js";

describe("autonomy sandbox policy", () => {
  function makeWorkspace(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "om-autonomy-"));
  }

  it("allows L1 identity paths inside knowledge/sacred", () => {
    const workspaceDir = makeWorkspace();
    expect(
      isPathWritableInSandbox("knowledge/sacred/SOUL.md", {
        workspaceDir,
      }),
    ).toBe(true);
    expect(
      isPathWritableInSandbox("knowledge/sacred/IDENTITY.md", {
        workspaceDir,
      }),
    ).toBe(true);
    expect(
      isPathWritableInSandbox("knowledge/sacred/MOOD.md", {
        workspaceDir,
      }),
    ).toBe(true);
  });

  it("keeps David_Akasha and non-L1 sacred files read-only", () => {
    const workspaceDir = makeWorkspace();
    expect(
      isPathWritableInSandbox("knowledge/sacred/David_Akasha.md", {
        workspaceDir,
      }),
    ).toBe(false);
    expect(
      isPathWritableInSandbox("knowledge/sacred/CHRONICLE.md", {
        workspaceDir,
      }),
    ).toBe(false);
  });

  it("still enforces workspace boundary for absolute paths", () => {
    const workspaceDir = makeWorkspace();
    const outsideFile = path.join(os.tmpdir(), "outside-autonomy-check.md");
    expect(
      isPathWritableInSandbox(outsideFile, {
        workspaceDir,
      }),
    ).toBe(false);
  });
});
