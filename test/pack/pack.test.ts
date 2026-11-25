/**
 * The packed tarball: its file set, its manifest, and that it starts in the real embedded OpenCode 2.4.1 host.
 *
 * `opencode plugin add` 2.4.1 accepts only an npm-registry or Git specifier (a local tarball path is refused with
 * "Plugin target must be an npm registry package or Git package specifier"), so this test installs the tarball with npm
 * and loads the installed package the way OpenCode resolves a plugin. The release install path is the Git tag
 * `opencode plugin add github:we-the-rebel-alliance/slack-plugin#vX.Y.Z`.
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"

const REPO = new URL("../..", import.meta.url).pathname
const PACKAGE = "@we-the-rebel-alliance/slack-plugin"
const OWN_METHODS = ["status", "probe", "events_list", "thread_read", "channels_list", "mentions_list", "mark_read"]

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], { cwd, encoding: "utf8", env: { ...process.env, npm_config_update_notifier: "false" } })
}

test("the tarball holds the files whitelist, installs with no runtime dependencies, and starts", { timeout: 300_000 }, async () => {
  const work = mkdtempSync(join("/tmp", "slack-pack-"))
  try {
    run("npm", ["run", "bundle"], REPO)
    const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work], REPO)) as { filename: string; files: { path: string }[] }[]
    const tarball = join(work, packed[0]!.filename)

    const paths = packed[0]!.files.map((file) => file.path).sort()
    assert.deepEqual(paths, [
      "LICENSE",
      "README.md",
      "assets/icon-128.png",
      "assets/icon-256.png",
      "assets/icon.svg",
      "dist/index.js",
      "package.json",
      "skills/slack-search/SKILL.md",
      "skills/slack/SKILL.md",
    ])
    assert.equal(paths.some((path) => path.endsWith(".d.ts") || path.includes("node_modules/")), false)

    const consumer = join(work, "consumer")
    mkdirSync(consumer, { recursive: true })
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "slack-pack-consumer", private: true, type: "module" }))
    run("npm", ["install", tarball, "@opencode/plugin@2.4.1", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], consumer)

    const installed = join(consumer, "node_modules", ...PACKAGE.split("/"))
    const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8")) as Record<string, unknown>
    assert.equal(manifest["name"], PACKAGE)
    assert.equal(manifest["version"], "0.0.0")
    assert.equal((manifest["capabilities"] as { plugin: { host: { opencode: string } } }).plugin.host.opencode, ">=2.4.1 <2.5.0")
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "bundleDependencies", "bundledDependencies"]) {
      assert.equal(manifest[field], undefined, field)
    }
    const lifecycle = ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish"]
    assert.deepEqual(Object.keys((manifest["scripts"] ?? {}) as object).filter((name) => lifecycle.includes(name)), [])

    const host = await createHost({ directory: installed, version: "2.4.1", pluginId: "slack", options: { accounts: { work: {}, personal: {} } } })
    try {
      assert.equal(host.failure, undefined, host.failure)
      assert.equal(host.refusal, undefined)
      assert.equal(host.definition?.id, "slack")
      assert.equal(host.namespace?.name, "slack")
      assert.equal(host.namespace?.description, (manifest["capabilities"] as { plugin: { summary: string } }).plugin.summary)
      assert.deepEqual(host.rpc?.methods.slice().sort(), [...OWN_METHODS].sort())
      assert.deepEqual(host.tools.map((tool) => tool.permission).sort(), OWN_METHODS.map((method) => `slack.${method}`).sort())
      assert.deepEqual(host.rpc?.events, ["changed"])
    } finally {
      await host.close()
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
