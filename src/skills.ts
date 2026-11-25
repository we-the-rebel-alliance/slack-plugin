/**
 * The plugin's skills, registered with OpenCode at setup.
 *
 * `skills/*\/SKILL.md` ships in the package, but OpenCode does not discover a plugin's skill files by itself: a skill
 * loads only when the plugin adds it through `ctx.skill.transform`. Every skill is validated before one is registered,
 * so a broken frontmatter fails setup instead of shipping a skill no agent can read.
 */
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode/plugin"
import { Skill } from "@opencode/plugin"

type SkillInfo = typeof Skill.Info.Type

const ROOT = new URL("../skills/", import.meta.url)
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/
/** A skill's directory id: lowercase letters and digits, hyphens between segments. */
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** The fixed-context budget: one skill description is at most 300 characters. */
const DESCRIPTION_MAX = 300

/** A broken package: the skill ships in the tarball but cannot be loaded. */
function invalid(id: string, what: string): Error {
  return new Error(`SKILLS_INVALID: the bundled skill "${id}" ${what}. Next step: reinstall the plugin from its release tag, then reload OpenCode.`)
}

/** The skill in one `SKILL.md`: its id, description and body, or undefined when the frontmatter is not usable. */
export function parseSkill(id: string, path: string, text: string): SkillInfo | undefined {
  const match = FRONTMATTER.exec(text)
  if (match === null) return undefined
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^([a-z]+):\s*(.*?)\s*$/.exec(line)
    if (field !== null) fields.set(field[1]!, field[2]!.replace(/^(["'])(.*)\1$/, "$2"))
  }
  const name = fields.get("name")
  const description = fields.get("description")
  const content = match[2]!.trim()
  if (name !== id || description === undefined || description === "" || description.length > DESCRIPTION_MAX || content === "") return undefined
  return {
    id: Skill.ID.make(id),
    name: Skill.Name.make(id),
    description,
    path: Skill.Info.fields.path.make(path),
    content,
  }
}

/** Every skill the package ships, from `skills/<id>/SKILL.md`, sorted by id. */
export async function loadSkills(root = ROOT): Promise<SkillInfo[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  if (ids.length === 0) throw invalid("skills", "has no directory")
  const skills: SkillInfo[] = []
  for (const id of ids) {
    if (!ID.test(id)) throw invalid(id, "has a directory name that is not a skill id")
    const path = fileURLToPath(new URL(`${id}/SKILL.md`, root))
    const text = await readFile(path, "utf8").catch(() => undefined)
    if (text === undefined) throw invalid(id, "has no SKILL.md")
    const skill = parseSkill(id, path, text)
    if (skill === undefined) throw invalid(id, `needs frontmatter with name "${id}", a non-empty description of at most ${DESCRIPTION_MAX} characters, and non-empty content`)
    skills.push(skill)
  }
  return skills
}

/** Load and register every shipped skill; a broken one fails setup. */
export async function registerSkills(skill: Pick<Plugin.Context["skill"], "transform">): Promise<void> {
  const skills = await loadSkills()
  await skill.transform((editor) => {
    for (const entry of skills) editor.add(entry)
  })
}
