import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the Sonar alpha shell and social preview", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /Sonar Alpha \| Semiconductor Intelligence Workbench/);
  assert.match(layout, /sonar-og\.png/);
  assert.match(layout, /lang="ko"/);
});

test("keeps the data contract, map lab, and surrogate lab in the product source", async () => {
  const [page, chat, readme, sidecar] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/local-sidecar.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Data intake/);
  assert.match(page, /Domain registry/);
  assert.match(page, /Map lab/);
  assert.match(page, /Surrogate lab/);
  assert.match(page, /File explorer/);
  assert.match(page, /24 latent \+ 18 explainable/);
  assert.match(chat, /proposedAnchor/);
  assert.match(chat, /GPT_OSS_ENDPOINT/);
  assert.match(readme, /long-form point store/);
  assert.match(readme, /npm run local/);
  assert.match(sidecar, /127\.0\.0\.1/);
  assert.match(sidecar, /ListObjectsV2Command/);
  assert.match(sidecar, /SONAR_LOCAL_ROOT/);
});
