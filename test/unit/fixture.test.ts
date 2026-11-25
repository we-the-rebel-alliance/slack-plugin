/**
 * The committed conformance recording must be what the handlers answer now.
 *
 * `SLACK_RECORD=1 node --test test/unit/fixture.test.ts` writes it again after a handler change; the committed file is
 * what `plugin-kit check` reads.
 */
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { test } from "node:test"
import { recordFixture } from "../support/fixture.ts"

const FIXTURE = new URL("../../fixtures/conformance.json", import.meta.url)

test("fixtures/conformance.json is what the handlers answer", async () => {
  const recorded = await recordFixture()
  if (process.env["SLACK_RECORD"] === "1") {
    mkdirSync(new URL("../../fixtures", import.meta.url), { recursive: true })
    writeFileSync(FIXTURE, `${JSON.stringify(recorded, null, 2)}\n`)
  }
  assert.deepEqual(JSON.parse(readFileSync(FIXTURE, "utf8")), recorded)
})
