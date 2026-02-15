import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyAgentTool } from "./pi-tools.types.js";
import {
  checkForLoop,
  resetLoopDetectorForTests,
  wrapEditWithGuardian,
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

    await expect((wrapped.execute as Function)("call-1", { path: file, content: "same content" })).rejects.toThrow(
      "REDUNDANT WRITE BLOCKED",
    );
    expect(execute).not.toHaveBeenCalled();
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

    await (wrapped.execute as Function)("call-1", { path: file, content: "new content" });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("accepts alternate path keys like TargetFile", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-"));
    const file = path.join(dir, "target-file.md");
    fs.writeFileSync(file, "same content", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", { TargetFile: file, content: "same content" }),
    ).rejects.toThrow(`"${file}" already contains the same content`);
    expect(execute).not.toHaveBeenCalled();
  });

  it("extracts nested and non-standard arg keys for path/content", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-"));
    const file = path.join(dir, "nested-keys.md");
    fs.writeFileSync(file, "same content", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", {
        request: { "file-path": file },
        payload: { Content: "same content" },
      }),
    ).rejects.toThrow(`"${file}" already contains the same content`);
    expect(execute).not.toHaveBeenCalled();
  });

  it("hard-blocks repeated write loops before execution", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    const args = { path: "knowledge/sacred/LOOP.md", content: "v1" };
    await (wrapped.execute as Function)("call-1", args);
    await (wrapped.execute as Function)("call-2", args);
    await expect((wrapped.execute as Function)("call-3", args)).rejects.toThrow(
      `"${args.path}" was called 3 times in a row`,
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("blocks writes when path points to a directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-dir-"));
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect((wrapped.execute as Function)("call-1", { path: dir, content: "new content" })).rejects.toThrow(
      "PATH_INVALID",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks writes when path is missing", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect((wrapped.execute as Function)("call-1", { content: "new content" })).rejects.toThrow(
      "PATH_INVALID",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("om-scaffolding edit path guard", () => {
  beforeEach(() => {
    resetLoopDetectorForTests();
  });

  it("blocks edits when path points to a directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-edit-dir-"));
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapEditWithGuardian({
      name: "edit",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", {
        path: dir,
        old_string: "old",
        new_string: "new",
      }),
    ).rejects.toThrow("PATH_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks edits when path is missing", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapEditWithGuardian({
      name: "edit",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", {
        old_string: "old",
        new_string: "new",
      }),
    ).rejects.toThrow("PATH_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });
});
