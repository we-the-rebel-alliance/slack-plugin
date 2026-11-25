/**
 * The skills in the package are registered on the real embedded OpenCode 2.4.1 host.
 *
 * OpenCode does not discover a plugin's `skills/` by itself: the plugin must add each one with `ctx.skill.transform`.
 * This test loads the built entry in the real `@opencode/sdk` host, activates it, and reads the host's skill list.
 */
import assert from "node:assert/strict"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import type { Plugin } from "@opencode/plugin"
import { OpenCode } from "@opencode/sdk"
import { parse } from "yaml"

const SKILLS = readdirSync(new URL("../../skills/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The description in a SKILL.md, parsed as YAML, checked to be real text and not a block-scalar marker. */
function expectedDescription(id: string): string {
  const text = readFileSync(new URL(`../../skills/${id}/SKILL.md`, import.meta.url), "utf8")
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
  assert.ok(frontmatter !== undefined, `${id}: no frontmatter`)
  const parsed = parse(frontmatter) as { description?: unknown }
  assert.equal(typeof parsed.description, "string", `${id}: description is not a string`)
  const description = String(parsed.description)
  assert.ok(description.trim() !== "" && description !== ">" && description !== "|", `${id}: description is empty or a block scalar`)
  return description
}

test("the plugin registers every shipped skill on the real 2.4.1 host", { timeout: 120_000 }, async () => {
  // The session's project is an empty directory, so the host cannot discover the package's `skills/` by itself: what
  // the list holds is exactly what the plugin registered.
  const project = mkdtempSync(join(tmpdir(), "slack-skills-"))
  const module = (await import(new URL("../../dist/index.js", import.meta.url).href)) as { default: Plugin.Plugin }
  // The host has no user config: the wrapper supplies the plugin options a person would write, so this empty project
  // still has the app client ID and the two aliases whose MCP servers the plugin must register.
  const wrapper: Plugin.Plugin = {
    id: module.default.id,
    async setup(context) {
      const proxy = new Proxy(context, {
        get(target, property) {
          if (property === "options") return { oauth: { client_id: "host-test-client" }, accounts: { default: {}, work: {} } }
          return Reflect.get(target, property)
        },
      })
      return module.default.setup(proxy)
    },
  }
  const host = await OpenCode.create({
    plugins: [wrapper],
    config: { directory: project },
    app: { name: "opencode", version: "2.4.1" },
    log: { level: "error", emit: () => undefined },
  })
  try {
    const session = await host.sessions.create({ location: { directory: project }, agent: "build", permissions: [] })
    await host.sessions.prompt({ sessionID: session.id, text: "activate the skill test", delivery: "queue" }).catch(() => undefined)
    let listed: { readonly id: string; readonly name?: string; readonly path?: string; readonly content?: string; readonly description?: string }[] = []
    for (const deadline = Date.now() + 60_000; Date.now() < deadline; ) {
      listed = (await host.skill.list({ location: { directory: project } })).data.map((skill: { readonly id: string; readonly name?: string; readonly path?: string; readonly content?: string; readonly description?: string }) => ({
        id: skill.id,
        ...(typeof skill.name === "string" ? { name: skill.name } : {}),
        ...(typeof skill.path === "string" ? { path: skill.path } : {}),
        ...(typeof skill.content === "string" ? { content: skill.content } : {}),
        ...(typeof skill.description === "string" ? { description: skill.description } : {}),
      }))
      if (SKILLS.every((id) => listed.some((skill) => skill.id === id))) break
      await sleep(250)
    }
    assert.deepEqual(SKILLS.filter((id) => !listed.some((skill) => skill.id === id)), [], `skills missing from the host: ${listed.map((skill) => skill.id).join(", ")}`)
    for (const id of SKILLS) {
      const skill = listed.find((entry) => entry.id === id)
      assert.ok(skill !== undefined, `the host did not register the ${id} skill`)
      assert.equal(skill.name, id, `${id}: the registered name differs from its directory`)
      assert.equal(skill.path, fileURLToPath(new URL(`../../skills/${id}/SKILL.md`, import.meta.url)), `${id}: the registered path differs`)
      assert.ok((skill.content ?? "").trim().length > 0, `${id}: the registered skill has no body`)
      assert.equal(skill.description, expectedDescription(id), `${id}: the registered description differs from its SKILL.md`)
    }

    const location = { directory: project }
    const commands = (await host.command.list({ location })).data.map((command: { readonly name: string }) => command.name)
    assert.ok(commands.includes("slack"), `commands missing /slack: ${commands.join(", ")}`)

    const servers = (await host.mcp.list({ location })).data.map((server: { readonly name: string }) => server.name).sort()
    assert.deepEqual(servers, ["slack", "slack-work"], `MCP servers registered: ${servers.join(", ")}`)

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
