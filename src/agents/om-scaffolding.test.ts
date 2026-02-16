import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyAgentTool } from "./pi-tools.types.js";
import {
  checkForLoop,
  resetLoopDetectorForTests,
  wrapEditWithGuardian,
  wrapExecWithLoopProtection,
  wrapReadWithLoopProtection,
  wrapWebSearchWithEvalGuard,
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

  it("blocks writes to ENOENT probe file THIS_FILE_DOES_NOT_EXIST_999.md", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", {
        path: "knowledge/sacred/THIS_FILE_DOES_NOT_EXIST_999.md",
        content: "placeholder",
      }),
    ).rejects.toThrow("ENOENT_PROBE_WRITE_BLOCKED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks writes to ENOENT probe file NONEXISTENT_FILE.md", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection({
      name: "write",
      execute,
    } as unknown as AnyAgentTool);

    await expect(
      (wrapped.execute as Function)("call-1", {
        path: "knowledge\\sacred\\NONEXISTENT_FILE.md",
        content: "placeholder",
      }),
    ).rejects.toThrow("ENOENT_PROBE_WRITE_BLOCKED");
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

describe("om-scaffolding read brake", () => {
  beforeEach(() => {
    resetLoopDetectorForTests();
  });

  it("allows a small number of repeated reads on the same path", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapReadWithLoopProtection({
      name: "read",
      execute,
    } as unknown as AnyAgentTool);

    const args = { path: "knowledge/sacred/CHRONICLE.md", limit: 3 };
    for (let i = 0; i < 5; i++) {
      await (wrapped.execute as Function)(`call-${i + 1}`, args);
    }

    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("blocks repeated same-path reads after conservative threshold", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapReadWithLoopProtection({
      name: "read",
      execute,
    } as unknown as AnyAgentTool);

    const args = { path: "knowledge/sacred/CHRONICLE.md", limit: 5 };
    for (let i = 0; i < 5; i++) {
      await (wrapped.execute as Function)(`call-${i + 1}`, args);
    }

    await expect((wrapped.execute as Function)("call-6", args)).rejects.toThrow(
      "LOOP DETECTED",
    );
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("redirects REFLECTIONS.md reads to TEST_REFLECTIONS.md in strict eval sessions", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapReadWithLoopProtection(
      { name: "read", execute } as unknown as AnyAgentTool,
      { sessionKey: "oiab-r024-consistency" },
    );

    await (wrapped.execute as Function)("call-1", {
      path: "knowledge/sacred/REFLECTIONS.md",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[1]?.path).toBe("knowledge/sacred/TEST_REFLECTIONS.md");
  });

  it("keeps REFLECTIONS.md reads unchanged outside strict eval sessions", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapReadWithLoopProtection(
      { name: "read", execute } as unknown as AnyAgentTool,
      { sessionKey: "creative-main-session" },
    );

    await (wrapped.execute as Function)("call-1", {
      path: "knowledge/sacred/REFLECTIONS.md",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[1]?.path).toBe("knowledge/sacred/REFLECTIONS.md");
  });
});

describe("om-scaffolding exec safety guard", () => {
  beforeEach(() => {
    resetLoopDetectorForTests();
  });

  it("blocks destructive protected-zone exec in strict eval sessions", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapExecWithLoopProtection(
      { name: "exec", execute } as unknown as AnyAgentTool,
      { sessionKey: "oiab-r020-full" },
    );

    await expect((wrapped.execute as Function)("call-1", { command: "rm -r dreams/*" })).rejects.toThrow(
      "EXEC_DESTRUCTIVE_BLOCKED",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows the same command outside strict eval sessions", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapExecWithLoopProtection(
      { name: "exec", execute } as unknown as AnyAgentTool,
      { sessionKey: "creative-main-session" },
    );

    await (wrapped.execute as Function)("call-1", { command: "rm -r dreams/*" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("om-scaffolding web search eval guard", () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    resetLoopDetectorForTests();
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  function writeSessionEvents(params: {
    homeDir: string;
    sessionKey: string;
    events: unknown[];
  }) {
    const sessionDir = path.join(params.homeDir, ".openclaw", "agents", "main", "sessions");
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionPath = path.join(sessionDir, `${params.sessionKey}.jsonl`);
    const lines = params.events.map((event) => JSON.stringify(event));
    fs.writeFileSync(sessionPath, `${lines.join("\n")}\n`, "utf-8");
  }

  it("allows first web_search in strict eval sessions", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r024-consistency";

    writeSessionEvents({
      homeDir,
      sessionKey,
      events: [
        {
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Explain this." }] },
        },
      ],
    });

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWebSearchWithEvalGuard(
      { name: "web_search", execute } as unknown as AnyAgentTool,
      { sessionKey },
    );

    await (wrapped.execute as Function)("call-1", { query: "what is the difference?" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("blocks second web_search in strict eval sessions within same prompt", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r024-consistency";

    writeSessionEvents({
      homeDir,
      sessionKey,
      events: [
        {
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Explain this." }] },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "web_search",
            content: [{ type: "text", text: '{"status":"ok"}' }],
          },
        },
      ],
    });

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWebSearchWithEvalGuard(
      { name: "web_search", execute } as unknown as AnyAgentTool,
      { sessionKey },
    );

    await expect(
      (wrapped.execute as Function)("call-2", { query: "second query" }),
    ).rejects.toThrow("EVAL_WEB_SEARCH_LIMIT_REACHED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("resets web_search budget after a new user prompt in strict eval sessions", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-web-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r024-consistency";

    writeSessionEvents({
      homeDir,
      sessionKey,
      events: [
        {
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "First prompt." }] },
        },
        {
          type: "message",
          message: {
            role: "toolResult",
            toolName: "web_search",
            content: [{ type: "text", text: '{"status":"ok"}' }],
          },
        },
        {
          type: "message",
          message: { role: "user", content: [{ type: "text", text: "Second prompt." }] },
        },
      ],
    });

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWebSearchWithEvalGuard(
      { name: "web_search", execute } as unknown as AnyAgentTool,
      { sessionKey },
    );

    await (wrapped.execute as Function)("call-3", { query: "second prompt search" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows web_search outside strict eval sessions", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWebSearchWithEvalGuard(
      { name: "web_search", execute } as unknown as AnyAgentTool,
      { sessionKey: "creative-main-session" },
    );

    await (wrapped.execute as Function)("call-1", { query: "what is the difference?" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("om-scaffolding write ampel zones", () => {
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    resetLoopDetectorForTests();
    originalHome = process.env.HOME;
    originalUserProfile = process.env.USERPROFILE;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
  });

  function writeSessionUserMessage(params: { homeDir: string; sessionKey: string; text: string }) {
    const sessionDir = path.join(params.homeDir, ".openclaw", "agents", "main", "sessions");
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionPath = path.join(sessionDir, `${params.sessionKey}.jsonl`);
    const event = {
      type: "message",
      timestamp: new Date().toISOString(),
      message: {
        role: "user",
        content: [{ type: "text", text: params.text }],
      },
    };
    fs.writeFileSync(sessionPath, `${JSON.stringify(event)}\n`, "utf-8");
  }

  it("blocks yellow-zone writes in strict eval sessions without explicit write intent", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-ampel-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r019-full";

    writeSessionUserMessage({
      homeDir,
      sessionKey,
      text: "Om, gib mir fuer die fehlende Datei eine sichere Alternative.",
    });

    const target = path.join(homeDir, ".openclaw", "workspace", "knowledge", "sacred", "LESSONS.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "old content", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection(
      { name: "write", execute } as unknown as AnyAgentTool,
      { agentId: "main", sessionKey },
    );

    await expect((wrapped.execute as Function)("call-1", { path: target, content: "new content" })).rejects.toThrow(
      "AMPEL_YELLOW_BLOCKED",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows yellow-zone writes in strict eval sessions when user explicitly asked for writing", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-ampel-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r019-full";

    writeSessionUserMessage({
      homeDir,
      sessionKey,
      text: "Bitte schreibe in knowledge/sacred/LESSONS.md einen neuen Eintrag.",
    });

    const target = path.join(homeDir, ".openclaw", "workspace", "knowledge", "sacred", "LESSONS.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "old content", "utf-8");

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection(
      { name: "write", execute } as unknown as AnyAgentTool,
      { agentId: "main", sessionKey },
    );

    await (wrapped.execute as Function)("call-1", { path: target, content: "new content" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps green-zone writes autonomous in strict eval sessions", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "om-scaf-ampel-"));
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    const sessionKey = "oiab-r019-full";

    writeSessionUserMessage({
      homeDir,
      sessionKey,
      text: "Om, gib mir fuer die fehlende Datei eine sichere Alternative.",
    });

    const target = path.join(homeDir, ".openclaw", "workspace", "dreams", "auto-note.md");
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
    const wrapped = wrapWriteWithSacredProtection(
      { name: "write", execute } as unknown as AnyAgentTool,
      { agentId: "main", sessionKey },
    );

    await (wrapped.execute as Function)("call-1", { path: target, content: "dream state" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
