/**
 * The small pieces a handler unit test needs: a `MethodCall`, a bus that records what it emitted, and the handler
 * table built over the fake provider.
 */
import type { Bus, BusEmitResult } from "@we-the-rebel-alliance/plugin-contract/bus"
import type { AccountProfile } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { MethodCall, HandlerTable } from "@we-the-rebel-alliance/plugin-contract/register"
import { createHandlers } from "../../src/handlers/index.ts"
import { manifest, version } from "../../src/manifest.ts"
import { readOptions } from "../../src/options.ts"
import type { SlackProvider } from "../../src/provider/types.ts"
import { createFakeProvider } from "./fake.ts"

/** The two aliases every test serves. */
export const PROFILES: readonly AccountProfile[] = [{ alias: "work", profile: {} }, { alias: "personal", profile: {} }]

/** The plugin's options with both aliases, and no client ID (the tests never sign in). */
export const OPTIONS = readOptions({ accounts: { work: {}, personal: {} } })

/** One emitted bus event, as a test reads it. */
export interface Emitted {
  readonly event: string
  readonly data: unknown
}

/** A bus writer that records every nudge and accepts it. */
export function recordingBus(): { readonly bus: Bus; readonly emitted: Emitted[] } {
  const emitted: Emitted[] = []
  const bus: Bus = {
    name: "slack",
    async emit(event, data): Promise<BusEmitResult> {
      emitted.push({ event, data })
      return { ok: true }
    },
  }
  return { bus, emitted }
}

/** One call, as a door would hand it to a handler. */
export function callFor(account: string, options: { readonly bus?: Bus; readonly signal?: AbortSignal; readonly unguarded?: MethodCall["unguardedAgents"] } = {}): MethodCall {
  return {
    sessionID: "ses_unit",
    agent: "build",
    messageID: "msg_unit",
    id: "call_unit",
    signal: options.signal ?? new AbortController().signal,
    progress: async () => {},
    account,
    bus: options.bus ?? recordingBus().bus,
    unguardedAgents: options.unguarded ?? (async () => ({ ok: true as const, agents: [] })),
    door: "codemode",
  }
}

/** The handler table over a fake provider. */
export function handlersWith(provider: SlackProvider, problems: readonly string[] = []): HandlerTable {
  return createHandlers({ manifest, profiles: PROFILES, options: OPTIONS, provider, version, hostVersion: "2.4.1", problems })
}

/** The table over the default fake. */
export const fakeTable = (options: Parameters<typeof createFakeProvider>[0] = {}): HandlerTable => handlersWith(createFakeProvider(options))
