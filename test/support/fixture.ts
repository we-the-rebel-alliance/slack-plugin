/**
 * The conformance fixture, recorded from the plugin's own handlers over the two synthetic workspaces.
 *
 * `fixtures/conformance.json` is committed, and a unit test compares it with what this function answers now, so the
 * recording cannot drift from the code. Set `SLACK_RECORD=1` while running that test to write it again. The data is
 * synthetic, so the kit's real-account redaction pass does not apply.
 */
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { packageName, manifest } from "../../src/manifest.ts"
import { callFor, handlersWith } from "./context.ts"
import { AS_OF, createFakeProvider, PERSONAL, WORK } from "./fake.ts"

/** A `since` the recorded cases share: every synthetic message is after it, and it does not move with the clock. */
export const SINCE = "2026-11-17T00:00:00Z"

const WORK_SCOPE = { channels: ["C0AAWORK01", "D0AAKAI001"] }
const PERSONAL_SCOPE = { channels: ["D0BBROWAN1"] }
const WORK_THREAD = "slack-thread:C0AAWORK01:1794996900.000100"
const PERSONAL_THREAD = "slack-thread:D0BBROWAN1:1794942300.000100"

/** A refusal's message, as the handler wrote it. */
async function refusalOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error("expected a refusal")
}

/**
 * Every recording the kit reads: the two accounts, both sources with their pages, probes, the detail, the suggest
 * read, status, and the RPC confirmation of the plugin's one write.
 */
export async function recordFixture(): Promise<Record<string, unknown>> {
  const provider = createFakeProvider({ asOf: AS_OF })
  const table = handlersWith(provider)
  const handlers = table as Record<string, { run(input: Readonly<Record<string, unknown>>, call: MethodCall): Promise<unknown> }>
  const run = (method: string, input: Readonly<Record<string, unknown>>, account = "work") => handlers[method]!.run(input, callFor(account))

  const workPage = await run("events_list", { source: "workspace", since: SINCE, scope: WORK_SCOPE })
  const workCursor = (workPage as { cursor: string }).cursor
  const personalPage = await run("events_list", { source: "workspace", since: SINCE, scope: PERSONAL_SCOPE }, "personal")
  const workMentions = await run("mentions_list", { source: "mentions", since: SINCE })
  const personalMentions = await run("mentions_list", { source: "mentions", since: SINCE }, "personal")

  return {
    $comment:
      "Recorded from the plugin's own handlers over two synthetic Slack workspaces, work and personal: every person, channel and message is invented. The Web API and the MCP tools are answered by test/support/fake.ts, so nothing here touched Slack.",
    plugin: packageName,
    accounts: {
      real: true,
      aliases: ["work", "personal"],
      required: { method: "events_list", code: "ACCOUNT_REQUIRED" },
      unknown: { method: "events_list", account: "nobodyhere", code: "ACCOUNT_UNKNOWN" },
      cursors: [
        {
          method: "events_list",
          account: "work",
          other: "personal",
          code: "CURSOR_INVALID",
          refuses: await refusalOf(() => run("events_list", { source: "workspace", since: SINCE, scope: WORK_SCOPE, cursor: workCursor }, "personal")),
        },
      ],
    },
    sources: {
      "slack.workspace": {
        cases: [
          { name: "both confirmed channels of the work account", input: { source: "workspace", since: SINCE, scope: WORK_SCOPE }, expect: "page", answer: workPage },
          { name: "the page after the work cursor", input: { source: "workspace", since: SINCE, scope: WORK_SCOPE, cursor: workCursor }, expect: "empty", answer: await run("events_list", { source: "workspace", since: SINCE, scope: WORK_SCOPE, cursor: workCursor }) },
          { name: "the personal account reads its own direct message", input: { source: "workspace", since: SINCE, scope: PERSONAL_SCOPE }, expect: "page", answer: personalPage },
          {
            name: "a channel the work account cannot read",
            input: { source: "workspace", since: SINCE, scope: { channels: ["C0ZZZZZZ99"] } },
            expect: { refuses: "INPUT_INVALID" },
            refuses: await refusalOf(() => run("events_list", { source: "workspace", since: SINCE, scope: { channels: ["C0ZZZZZZ99"] } })),
          },
        ],
        probe: { input: { source: "workspace", account: "work" }, answer: await run("probe", { source: "workspace" }) },
        details: [
          { id: "slack.workspace.thread", scope: WORK_SCOPE, event: { thread: WORK_THREAD }, answer: await run("thread_read", { scope: WORK_SCOPE, fields: { thread: WORK_THREAD } }) },
          {
            id: "slack.workspace.thread",
            scope: PERSONAL_SCOPE,
            event: { thread: PERSONAL_THREAD },
            expect: { refuses: "PERMISSION_DENIED" },
            refuses: await refusalOf(() => run("thread_read", { scope: WORK_SCOPE, fields: { thread: PERSONAL_THREAD } })),
          },
        ],
        suggest: { input: { source: "slack.workspace", account: "work" }, answer: await run("channels_list", { source: "workspace" }) },
      },
      "slack.mentions": {
        cases: [
          { name: "the work account's mentions", input: { source: "mentions", since: SINCE }, expect: "page", answer: workMentions },
          { name: "the personal account's mentions", input: { source: "mentions", since: SINCE }, expect: "page", answer: personalMentions },
        ],
        probe: { input: { source: "mentions", account: "work" }, answer: await run("probe", { source: "mentions" }) },
      },
    },
    events: {
      emitted: ["changed"],
      status: await run("status", {}, "default"),
    },
    rpc: {
      inputs: { mark_read: { channel_id: "C0AAWORK01", ts: "1794996900.000100" } },
      calls: [{ method: "mark_read", ask: "denied", expect: { code: "PERMISSION_DENIED" } }],
    },
    namespace: manifest.plugin.summary,
  }
}

/** What the two synthetic workspaces hold, for a test that wants to name one. */
export const FIXTURE_WORKSPACES = { work: WORK, personal: PERSONAL }
