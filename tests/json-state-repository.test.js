import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStateRepository } from "../src/repositories/json/json-state-repository.js";

test("JsonStateRepository recreates state when the file is corrupted", async () => {
  const stateFilePath = path.join(os.tmpdir(), `form-hub-state-${Date.now()}.json`);
  await fs.writeFile(stateFilePath, '{"broken": ', "utf8");

  const repository = new JsonStateRepository(stateFilePath);
  const state = await repository.readState();

  assert.deepEqual(state.documents, []);
  const repaired = JSON.parse(await fs.readFile(stateFilePath, "utf8"));
  assert.deepEqual(repaired.documents, []);

  const dirEntries = await fs.readdir(path.dirname(stateFilePath));
  assert.equal(dirEntries.some((entry) => entry.startsWith(path.basename(stateFilePath) + ".corrupt-")), true);

  await fs.rm(stateFilePath, { force: true });
  await Promise.all(
    dirEntries
      .filter((entry) => entry.startsWith(path.basename(stateFilePath) + ".corrupt-"))
      .map((entry) => fs.rm(path.join(path.dirname(stateFilePath), entry), { force: true })),
  );
});
