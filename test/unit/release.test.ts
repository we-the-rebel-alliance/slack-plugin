// The release workflow publishes exactly the three files a consumer pins; a bare release/* glob would upload a
// directory (release/dist) and fail the whole release, as it did for colab.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const workflow = readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8")

test("the release publishes exactly the package, the conformance report and the checksums", () => {
  const create = workflow.split("\n").find((line) => line.includes("gh release create"))
  assert.ok(create !== undefined, "the workflow has no gh release create step")
  assert.match(create, /release\/\*\.tgz/)
  assert.match(create, /release\/conformance\.json/)
  assert.match(create, /release\/SHA256SUMS/)
  for (const line of workflow.split("\n")) assert.doesNotMatch(line, /release\/\*(?!\.tgz)/, `a bare release/* glob: ${line.trim()}`)
})
