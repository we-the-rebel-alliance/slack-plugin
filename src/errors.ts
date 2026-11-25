/**
 * The plugin's refusals, in the contract's one form (contract §12): `CODE: What happened. Next step: What to do.`
 *
 * Every code is one the contract's table holds; the register maps a thrown `SourceError` to it and redacts both lines.
 * A failure never carries a credential: Slack's own error code is allowed, its answer is not.
 */
import { SourceError, type ErrorCode } from "@we-the-rebel-alliance/plugin-contract/events"

/** One refusal, from a contract code and two one-line sentences. */
export function failure(code: ErrorCode, what: string, next: string, extra: { readonly retryAfterSec?: number } = {}): SourceError {
  return new SourceError({ code, what, next, ...(extra.retryAfterSec === undefined ? {} : { retryAfterSec: extra.retryAfterSec }) })
}

/** The next step for an alias whose server has no usable sign-in. */
export function signInNext(alias: string, server: string): string {
  return `Run /connect, choose ${server}, and sign in to the Slack workspace for the account "${alias}".`
}

/** An alias the plugin cannot act as: no server, no sign-in, or a sign-in OpenCode cannot resolve. */
export function needsSignIn(alias: string, server: string, action: string): SourceError {
  return failure("NEEDS_SIGN_IN", `${action} has no usable Slack sign-in for the account "${alias}" (${server})`, signInNext(alias, server))
}

/** Slack asked the caller to slow down. */
export function rateLimited(action: string, retryAfterSec?: number): SourceError {
  return failure("RATE_LIMITED", `Slack asked ${action} to slow down`, "Wait, then call it again.", retryAfterSec === undefined ? {} : { retryAfterSec })
}

/** Slack refused a call for a scope the sign-in does not hold. */
export function scopeMissing(scope: string): SourceError {
  return failure("SCOPE_MISSING", `Slack refused the call: the sign-in lacks the scope ${scope}`, `Add ${scope} to the Slack app's user scopes and to the plugin's oauth.scopes, then sign in again.`)
}
