import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSandbox, defineSandbox } from "../src/index.js";

test("sandbox isolates and allowlists", () => {
  const dir = mkdtempSync(join(tmpdir(), "hsb-"));
  try {
    const sbx = createSandbox(dir, defineSandbox({ backend: "local" }), "t");
    sbx.writeFile("workspace/a.md", "Paris");
    assert.ok(sbx.glob("workspace/*.md").length);
    assert.equal(sbx.bash("rm -rf /").exitCode, 126);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
