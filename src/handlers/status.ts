/**
 * `status` (contract §11): the plugin's identity, its host range, every account's state and owner, the agents whose
 * rules no longer match what the plugin generated, and one next step.
 *
 * `statusAnswer` builds the whole answer from what the handler already knows, so no state is kept between `register`
 * and this call. The same builder serves the `status` method and the `/slack` command, so the two cannot disagree.
 */
import { accountStatuses, redactReason, STATUS_SCHEMA, statusAnswer, type AccountSignal, type StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { UnguardedAgentsResult } from "@we-the-rebel-alliance/plugin-contract/access"
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

/** The status answer from the context and the unguarded-agent result, for the method and the command. */
export async function statusOf(context: HandlerContext, unguardedAgents: UnguardedAgentsResult, signal?: AbortSignal): Promise<StatusAnswer> {
  const signals: Record<string, AccountSignal> = {}
  for (const profile of context.profiles) {
    try {
      const identity = await context.provider.identity(profile.alias, signal)
      signals[profile.alias] = { state: "ready", owner: ownerOf(identity) }
    } catch (error) {
      if (error instanceof SourceError && error.code === "NEEDS_SIGN_IN") signals[profile.alias] = { state: "needs_sign_in" }
      else signals[profile.alias] = { state: "error", reason: redactReason(error instanceof Error ? error.message : String(error)) }
    }
  }
  return statusAnswer({
    manifest: context.manifest,
    version: context.version,
    hostVersion: context.hostVersion,
    accounts: accountStatuses(context.profiles, signals),
    problems: [...context.problems],
    unguardedAgents,
  })
}

/** The status answer as one message for `/slack`: the state, every alias and owner, and the next step. */
export function statusText(answer: StatusAnswer): string {
  const lines = [`Slack ${answer.version} on OpenCode ${answer.host.version}: ${answer.state}.`]
  for (const account of answer.accounts) {
    const owner = account.owner === undefined ? "" : ` (${account.owner.label})`
    const reason = account.reason === undefined ? "" : ` — ${account.reason}`
    lines.push(`- ${account.alias}: ${account.state}${owner}${reason}`)
  }
  if (answer.unguardedAgents.length > 0) lines.push(`Agents without the generated rules: ${answer.unguardedAgents.join(", ")}.`)
  if (answer.nextStep !== null) lines.push(`Next step: ${answer.nextStep}`)
  return lines.join("\n")
}

const EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false } as const

/** The status handler: one probe-like `auth.test` per alias, then the contract's answer. */
export function statusHandler(context: HandlerContext): MethodHandler {
  return {
    description: "Read the Slack plugin's state: its host range, every account alias with its owner, and the next step when one is not ready.",
    input: EMPTY_INPUT,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      return statusOf(context, await call.unguardedAgents(), call.signal)
    },
  }
}
