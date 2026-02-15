import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyAgentTool } from "./pi-tools.types.js";
import {
  checkForLoop,
  resetLoopDetectorForTests,
  wrapWriteWithSacredProtection,
} from "./om-scaffolding.js";

describe("om-scaffolding loop detector", () => {
  beforeEach(() => {
    resetLoopDetectorForTests();
  });

  it("enters cooldown after consecutive repeated calls", () => {
    const target = "knowledge/sacred/TEST.md";

    expect(checkForLoop("write", target)).toBeNull();
    expect(checkForLoop("write", target)).toBeNull();

    const third = checkForLoop("write", target);
    expect(third).toContain("LOOP DETECTED");

    const cooldown = checkForLoop("write", target);
    expect(cooldown).toContain("LOOP COOLDOWN ACTIVE");
  });

  it("detects repeated retries even when interleaved with other tools", () => {
    const target = "knowledge/sacred/INTERLEAVED.md";

    for (let i = 0; i < 4; i++) {
      expect(checkForLoop("write", target)).toBeNull();
      expect(checkForLoop("read", target)).toBeNull();
    }

    const fifthWrite = checkForLoop("write", target);
    expect(fifthWrite).toContain("REPEAT LOOP DETECTED");
  });
});

describe("om-scaffolding write guard", () => {
  beforeEach(() => {
    resetLoopDetectorForTests();
  });

  it("blocks redundant writes when content is unchanged", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-"));
    const file = path.join(dir, "same.md");
    fs.writeFileSync(file, "same content", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    const result = await (wrapped.execute as Function)({ path: file, content: "same content" });

    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain("REDUNDANT WRITE BLOCKED");
  });

  it("allows writes when content changed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-"));
    const file = path.join(dir, "change.md");
    fs.writeFileSync(file, "old", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await (wrapped.execute as Function)({ path: file, content: "new content" });

    expect(execute).toHaveBeenCalledTimes(1);
  });
});
