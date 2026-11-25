/**
 * `probe` (contract §11): the signed-in owner of an account, and the scopes its sign-in holds. It reads no content.
 *
 * The owner names the Slack user (`slack:U…`), and `orgs` carries the workspace and, on an Enterprise Grid, the
 * organization: `slack-team:T…` and `slack-enterprise:E…`, at most five.
 */
import { PROBE_SCHEMA, probeResult } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { failure } from "../errors.ts"
import type { HandlerContext } from "./index.ts"
import { ownerOf } from "./status.ts"

/** The sources a probe answers for: the workspace and the mentions feed. */
export const PROBE_SOURCES = ["workspace", "mentions"] as const

const INPUT = {
  type: "object",
  properties: {
    source: { type: "string", description: "The source to probe: workspace (the default) or mentions" },
  },
  additionalProperties: false,
} as const

/** The probe handler. */
export function probeHandler(context: HandlerContext): MethodHandler {
  return {
    description: "Read the Slack owner and workspace a source's account is signed in as, with the scopes its sign-in holds. It reads no message.",
    input: INPUT,
    output: PROBE_SCHEMA,
    async run(input, call) {
      const source = typeof input["source"] === "string" ? input["source"] : "workspace"
      if (!(PROBE_SOURCES as readonly string[]).includes(source)) {
        throw failure("SOURCE_UNKNOWN", `probe has no source ${JSON.stringify(source)}`, "Pass workspace or mentions, or leave source out.")
      }
      const identity = await context.provider.identity(call.account, call.signal)
      const scopes = await context.provider.grantedScopes(call.account).catch(() => undefined)
      return probeResult({ source, account: call.account, owner: ownerOf(identity) }, scopes === undefined ? {} : { scopes })
    },
  }
}
