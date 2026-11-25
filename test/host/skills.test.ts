/**
 * The skills in the package are registered on the real embedded OpenCode 2.4.1 host.
 *
 * OpenCode does not discover a plugin's `skills/` by itself: the plugin must add each one with `ctx.skill.transform`.
 * This test loads the built entry in the real `@opencode/sdk` host, activates it, and reads the host's skill list.
 */
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { Plugin } from "@opencode/plugin"
import { OpenCode } from "@opencode/sdk"

const SKILLS = readdirSync(new URL("../../skills/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("the plugin registers every shipped skill on the real 2.4.1 host", { timeout: 120_000 }, async () => {
  // The session's project is an empty directory, so the host cannot discover the package's `skills/` by itself: what
  // the list holds is exactly what the plugin registered.
  const project = mkdtempSync(join(tmpdir(), "slack-skills-"))
  const module = (await import(new URL("../../dist/index.js", import.meta.url).href)) as { default: Plugin.Plugin }
  const host = await OpenCode.create({
    plugins: [module.default],
    config: { directory: project },
    app: { name: "opencode", version: "2.4.1" },
    log: { level: "error", emit: () => undefined },
  })
  try {
    const session = await host.sessions.create({ location: { directory: project }, agent: "build", permissions: [] })
    await host.sessions.prompt({ sessionID: session.id, text: "activate the skill test", delivery: "queue" }).catch(() => undefined)
    let seen: string[] = []
    for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
      seen = (await host.skill.list({ location: { directory: project } })).data.map((skill: { readonly id: string }) => skill.id)
      if (SKILLS.every((id) => seen.includes(id))) break
      await sleep(250)
    }
    assert.deepEqual(SKILLS.filter((id) => !seen.includes(id)), [], `skills missing from the host: ${seen.join(", ")}`)

    const location = { directory: project }
    const commands = (await host.command.list({ location })).data.map((command: { readonly name: string }) => command.name)
    assert.ok(commands.includes("slack"), `commands missing /slack: ${commands.join(", ")}`)

    const agents = (await host.agent.list({ location })).data as readonly { readonly id: string; readonly permissions?: readonly { readonly action: string }[] }[]
    assert.deepEqual(
      agents.filter((agent) => !(agent.permissions ?? []).some((rule) => rule.action === "slack.status")).map((agent) => agent.id),
      [],
      "every agent carries the generated slack.status rule",
    )

    const status = await host.rpc.call({ rpcID: "slack", method: "status", input: { sessionID: session.id, input: {} }, location })
    const answer = status.output as { readonly name?: string; readonly version?: string; readonly state?: string }
    assert.equal(answer.name, "slack")
    assert.equal(answer.version, "0.0.0")
    assert.ok(typeof answer.state === "string" && answer.state.length > 0)
  } finally {
    await host.close()
    rmSync(project, { recursive: true, force: true })
  }
})
