/**
 * The plugin's manifest, read from the installed package on disk.
 *
 * `capabilities` in `package.json` is the one source of truth (contract §4): the catalog validates and hashes it, and
 * `plugin-kit` compares every generated doc section with it. Nothing else in the plugin repeats a method, source or
 * action. The version beside it is the installed package's, which status reports.
 */
import { readFileSync } from "node:fs"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"

interface InstalledPackage {
  readonly name: string
  readonly version: string
  readonly capabilities: Manifest
}

/** The installed `package.json`, beside this file's package root (`src/` in a checkout, `dist/` when installed). */
function installed(): InstalledPackage {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as InstalledPackage
}

const pkg = installed()

/** The capabilities manifest every module reads. */
export const manifest: Manifest = pkg.capabilities
/** The installed package's name. */
export const packageName: string = pkg.name
/** The installed package's version, for status. */
export const version: string = pkg.version
