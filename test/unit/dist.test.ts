/**
 * The built entry is committed: a permanent tag install has no build step and no devDependencies, so `dist/index.js`
 * must be in the tree they install. A fresh bundle must reproduce it byte for byte, or the tag ships stale code.
 */
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const REPO = new URL("../..", import.meta.url).pathname

test("the committed bundle is the server entry, and a fresh bundle leaves it unchanged", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { exports: Record<string, string> }
  assert.equal(pkg.exports["./server"], "./dist/index.js")

  const inHead = spawnSync("git", ["cat-file", "-e", "HEAD:dist/index.js"], { cwd: REPO, encoding: "utf8" })
  assert.equal(inHead.status, 0, "dist/index.js is in HEAD, so a tag install finds it")
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "dist/index.js"], { cwd: REPO, encoding: "utf8" })
  assert.equal(tracked.status, 0, "dist/index.js is tracked, not ignored")

  execFileSync("npm", ["run", "bundle"], { cwd: REPO, stdio: "inherit" })
  const diff = spawnSync("git", ["diff", "--exit-code", "HEAD", "--", "dist"], { cwd: REPO, encoding: "utf8" })
  assert.equal(diff.status, 0, `a fresh bundle changed dist/:\n${diff.stdout}\n${diff.stderr}`)
})
