// R18: what the model reads says what the default does. Every tool is allowed under `access: "all"`, so no text the
// model sees may say a tool asks first, is read-only, needs an option turned on, or is off until it is classified.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { NAMESPACE_DESCRIPTION } from "../../src/tools.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")

/** A claim that is false under the default block: a tool cannot ask, be refused or be off, because every tool allows. */
const STALE: [string, RegExp][] = [
  // Case-sensitive "asks": the imperative "Ask the user before …" is guidance to the model, not a claim about a rule.
  ["says a tool asks first", /\basks (?:the user )?(?:first|before)\b/],
  ["needs an option turned on", /\bneeds? (?:the (?:plugin )?)?option\b/i],
  ["is off until classified", /\b(?:off|asks?) until (?:it is |they are )?classif/i],
  ["says it is read-only now", /\bread-only now\b/i],
  ["is refused while read-only", /\brefused while (?:the plugin is )?read-only\b/i],
  ["says no tool changes anything", /\bno tool (?:here )?changes\b/i],
]

/** A sentence that names a restricting value describes that value, not the default, so it is not a claim about `all`. */
const atAll = (text: string) =>
  text
    .split(/(?<=[.:])\s+/)
    .filter((sentence) => !/["`'](?:ask-changes|read-only)["`']/.test(sentence))
    .join(" ")

describe("the model-facing text at access all", () => {
  const all = {
    "the Code Mode namespace": NAMESPACE_DESCRIPTION,
    "the declaration summary": (JSON.parse(read("package.json")) as { jelly?: { summary?: string } }).jelly?.summary ?? "",
    ...Object.fromEntries(readdirSync(join(ROOT, "skills")).map((name) => [`skills/${name}/SKILL.md`, read(`skills/${name}/SKILL.md`)] as const)),
  }

  test.each(Object.entries(all))("%s claims nothing the default block contradicts", (_file, text) => {
    for (const [claim, pattern] of STALE) expect({ claim, hit: pattern.exec(atAll(text))?.[0] ?? null }).toEqual({ claim, hit: null })
  })

  test("the skill carries the access levels the fixed namespace line leaves out", () => {
    const skill = read("skills/slack-search/SKILL.md")
    expect(skill).toContain("## Access levels")
    expect(skill).toContain('At `"ask-changes"` OpenCode asks before writes and sends, the private-channel search, file reads')
    expect(skill).toContain('at `"read-only"` it denies them and keeps the reads')
    // The namespace line is the fixed 257-character text from the audit: it carries no access claim at all.
    expect(NAMESPACE_DESCRIPTION).not.toContain("ask-changes")
    expect(NAMESPACE_DESCRIPTION).not.toContain("read-only")
  })

  test("does not state that every tool is allowed as a fact about every access value", () => {
    expect(NAMESPACE_DESCRIPTION).not.toMatch(/every tool is allowed/i)
    expect(NAMESPACE_DESCRIPTION).not.toMatch(/changes are allowed/i)
  })
})
