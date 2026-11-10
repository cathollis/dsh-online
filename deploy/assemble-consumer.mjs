#!/usr/bin/env node
/**
 * Assemble a consumer installation from packed npm tarballs.
 *
 * This mirrors `packedDependencies` in scripts/release/verify-packed-install.ts: every
 * tarball becomes a `file:` dependency of one throwaway consumer manifest, so the image
 * installs the same payload the release pipeline verifies. Tarballs whose `os`/`cpu`
 * fields exclude this host become optional dependencies, because npm refuses a required
 * dependency it cannot install.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Test whether an npm `os` or `cpu` field admits a value, following npm's install checks.
 * @param {unknown} value - raw manifest field; undefined admits every value.
 * @param {string} current - target platform or architecture.
 * @returns {boolean} whether the package may install for the target.
 */
function acceptsNpmPlatform(value, current) {
  if (value === undefined) return true
  if (!Array.isArray(value) || !value.every(tag => typeof tag === 'string')) {
    throw new Error('npm platform constraints must be arrays of strings')
  }
  let accepted = value.every(tag => tag.startsWith('!'))
  for (const tag of value) {
    if (tag === `!${current}`) return false
    if (tag === current || (tag === 'any' && value.length === 1)) accepted = true
  }
  return accepted
}

const args = process.argv.slice(2)
let out
const from = []

for (let index = 0; index < args.length; index += 1) {
  const flag = args[index]
  if (flag === '--out') {
    index += 1
    out = args[index]
  } else if (flag === '--from') {
    index += 1
    from.push(args[index])
  } else {
    throw new Error(`unknown argument: ${flag}`)
  }
}

if (out === undefined || from.length === 0) {
  throw new Error('usage: assemble-consumer.mjs --out <directory> --from <directory>...')
}

const dependencies = {}
const optionalDependencies = {}

for (const directory of from) {
  for (const file of readdirSync(resolve(directory)).filter(name => name.endsWith('.tgz'))) {
    const tarball = resolve(directory, file)
    const manifest = JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }))
    const compatible = acceptsNpmPlatform(manifest.os, process.platform)
      && acceptsNpmPlatform(manifest.cpu, process.arch)
    const section = compatible ? dependencies : optionalDependencies
    section[manifest.name] = `file:${tarball}`
  }
}

mkdirSync(out, { recursive: true })
writeFileSync(
  join(out, 'package.json'),
  `${JSON.stringify({
    name: 'dsh-installed',
    version: '0.0.0',
    private: true,
    dependencies,
    ...(Object.keys(optionalDependencies).length === 0 ? {} : { optionalDependencies }),
  }, null, 2)}\n`,
)

console.log(`assembled ${String(Object.keys(dependencies).length)} package(s) into ${out}`
  + `, ${String(Object.keys(optionalDependencies).length)} optional for this host`)
