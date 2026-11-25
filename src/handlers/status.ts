/**
 * `status` (contract §11): the plugin's identity, its host range, every account's state and owner, the agents whose
 * rules no longer match what the plugin generated, and one next step.
 *
 * `statusAnswer` builds the whole answer from what the handler already knows, so no state is kept between `register`
 * and this call. An agent list that cannot be read is unknown, never zero: its error becomes a problem and the state
 * says `error`.
 */
import { accountStatuses, redactReason, STATUS_SCHEMA, statusAnswer, type AccountSignal } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { SourceError } from "@we-the-rebel-alliance/plugin-contract/events"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import type { SlackIdentity } from "../provider/types.ts"
import type { HandlerContext } from "./index.ts"

/** The contract's owner for a Slack sign-in: the user, with the workspace and grid as organizations. */
export function ownerOf(identity: SlackIdentity): {
  readonly id: string
  readonly label: string
  readonly orgs: readonly { readonly id: string; readonly label: string }[]
} {
  return {
    id: `slack:${identity.userId}`,
    label: identity.userName ?? identity.userId,
    orgs: [
      { id: `slack-team:${identity.teamId}`, label: identity.teamName ?? identity.teamId },
      ...(identity.enterpriseId === undefined ? [] : [{ id: `slack-enterprise:${identity.enterpriseId}`, label: identity.enterpriseName ?? identity.enterpriseId }]),
    ],
  }
}

const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false } as const

/** The status handler: one probe-like `auth.test` per alias, then the contract's answer. */
export function statusHandler(context: HandlerContext): MethodHandler {
  return {
    description: "Read the Slack plugin's state: its host range, every account alias with its owner, and the next step when one is not ready.",
    input: EMPTY_INPUT,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      const signals: Record<string, AccountSignal> = {}
      for (const profile of context.profiles) {
        try {
          const identity = await context.provider.identity(profile.alias, call.signal)
          signals[profile.alias] = { state: "ready", owner: ownerOf(identity) }
        } catch (error) {
          if (error instanceof SourceError && error.code === "NEEDS_SIGN_IN") signals[profile.alias] = { state: "needs_sign_in" }
          else signals[profile.alias] = { state: "error", reason: redactReason(error instanceof Error ? error.message : String(error)) }
        }
      }
      const problems = [...context.problems]
      return statusAnswer({
        manifest: context.manifest,
        version: context.version,
        hostVersion: context.hostVersion,
        accounts: accountStatuses(context.profiles, signals),
        problems,
        unguardedAgents: await call.unguardedAgents(),
      })
    },
  }
}
