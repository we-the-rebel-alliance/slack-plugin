/**
 * The plugin's one `register` call (contract §9), its `/slack` status command, and the skills it ships.
 *
 * `setup` gates the host first, registers the skills, reads the plugin's own options, registers the global Slack-app
 * sign-in and one MCP server per alias, then hands the handler table to `register`, which wires the agent tool, Code
 * Mode and the RPC from that one table and builds the bus. Nothing here registers a tool, an RPC or a permission rule
 * by hand.
 */
import { Plugin } from "@opencode/plugin"
import { accessLevel, rulesFor, unguardedAgents, type UnguardedAgentsResult } from "@we-the-rebel-alliance/plugin-contract/access"
import { accountsOf, redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { registerAppIntegration, registerSlackAccounts, resolveClient } from "./accounts.ts"
import { createHandlers, type HandlerContext } from "./handlers/index.ts"
import { statusOf, statusText } from "./handlers/status.ts"
import { manifest, version } from "./manifest.ts"
import { readOptions } from "./options.ts"
import { createSlackProvider } from "./provider/slack.ts"
import { registerSkills } from "./skills.ts"

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(ctx) {
    assertHost(ctx, manifest)
    const options = readOptions(ctx.options)
    await registerSkills(ctx.skill)
    await registerAppIntegration(ctx.integration)
    const client = await resolveClient(ctx.integration, options)
    const accounts = await registerSlackAccounts(ctx, manifest, options, client)
    const plan = accountsOf(manifest, ctx.options ?? {})
    if (!plan.ok) {
      throw new Error(`OPTIONS_INVALID: ${plan.problems.join("; ")}. Next step: fix the plugin's accounts option.`)
    }
    const level = accessLevel(ctx.options)
    if (!level.ok) {
      throw new Error(`OPTIONS_INVALID: ${level.problems.join("; ")}. Next step: set access to all, ask-changes or read-only.`)
    }
    const context: HandlerContext = {
      manifest,
      profiles: plan.value.accounts,
      options,
      provider: createSlackProvider(ctx),
      version,
      hostVersion: ctx.app.version,
      problems: [...accounts.problems],
    }
    const registration = await register(ctx, manifest, createHandlers(context))
    // The contract's status command: `/slack` renders the same answer as the `status` method, computed from the same
    // generated rules, so the command and the method cannot disagree.
    const aliases = plan.value.accounts.map((account) => account.alias)
    const command = await ctx.command.transform((editor) => {
      editor.add({
        name: "slack",
        description: "Show the Slack plugin's status, accounts and next step",
        async execute({ sessionID, delivery }) {
          let unguarded: UnguardedAgentsResult
          try {
            unguarded = { ok: true, agents: unguardedAgents((await ctx.agent.list()).data, rulesFor(manifest, level.value, aliases)) }
          } catch (error) {
            unguarded = { ok: false, error: redactReason(error instanceof Error ? error.message : String(error)) }
          }
          await ctx.session.synthetic({ sessionID, delivery, text: statusText(await statusOf(context, unguarded)), description: "Slack status", resume: false })
        },
      })
    })
    return async () => {
      await command.dispose().catch(() => undefined)
      await registration.dispose()
    }
  },
})
