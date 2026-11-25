/**
 * The plugin's one `register` call (contract §9).
 *
 * `setup` gates the host first, reads the plugin's own options, registers the global Slack-app sign-in and one MCP
 * server per alias, then hands the handler table to `register`, which wires the agent tool, Code Mode and the RPC from
 * that one table and builds the bus. Nothing here registers a tool, an RPC or a permission rule by hand.
 */
import { Plugin } from "@opencode/plugin"
import { accountsOf } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { registerAppIntegration, registerSlackAccounts, resolveClient } from "./accounts.ts"
import { createHandlers } from "./handlers/index.ts"
import { manifest, version } from "./manifest.ts"
import { readOptions } from "./options.ts"
import { createSlackProvider } from "./provider/slack.ts"

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(ctx) {
    assertHost(ctx, manifest)
    const options = readOptions(ctx.options)
    await registerAppIntegration(ctx.integration)
    const client = await resolveClient(ctx.integration, options)
    const accounts = await registerSlackAccounts(ctx, manifest, options, client)
    const plan = accountsOf(manifest, ctx.options ?? {})
    if (!plan.ok) {
      throw new Error(`OPTIONS_INVALID: ${plan.problems.join("; ")}. Next step: fix the plugin's accounts option.`)
    }
    const handlers = createHandlers({
      manifest,
      profiles: plan.value.accounts,
      options,
      provider: createSlackProvider(ctx),
      version,
      hostVersion: ctx.app.version,
      problems: [...accounts.problems],
    })
    const registration = await register(ctx, manifest, handlers)
    return () => registration.dispose()
  },
})
