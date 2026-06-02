#!/usr/bin/env node
/*
 * build-wall-paneling-catalog.mjs — one-shot build helper.
 *
 *   1. Reads apollo inventory at <inventory-path> (84 products, 11 categories,
 *      each carries image_url + width/height + display name for dedup).
 *   2. Generates STABLE slugs (kebab-ascii) for each category + product.
 *      Duplicate names within a category get a -2/-3 collision suffix.
 *   3. Downloads each PNG into public/catalog/wall-paneling/<cat-slug>/<prod-slug>.png
 *      (skips if file already exists with non-zero size).
 *   4. Emits the constants.ts SERVICE_CATALOG wall_paneling optionGroups
 *      block to stdout — paste it over the current wall_paneling.optionGroups
 *      array in src/lib/constants.ts.
 *
 * IMPORTANT: names are stripped from the final config per Rod-directive —
 * label="" on every option. Names are only used during this build for slug
 * derivation; vendor fills names + prices later on-platform.
 *
 * Usage (from /tmp/bc-post461):
 *   node scripts/build-wall-paneling-catalog.mjs \
 *     /Users/rodolfoguzman/buildconnect/scripts/audit/wall-paneling-inventory.json
 */

import { readFileSync, existsSync, mkdirSync, statSync, createWriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { get as httpsGet } from 'node:https'
import { pipeline } from 'node:stream/promises'

const INV_PATH = process.argv[2] || '/Users/rodolfoguzman/buildconnect/scripts/audit/wall-paneling-inventory.json'
const ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const PUBLIC_DIR = join(ROOT, 'public', 'catalog', 'wall-paneling')

function slugify(s) {
  // Strip accents, lowercase, collapse non-alnum to dashes.
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function dedupSlug(base, taken) {
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
  throw new Error(`could not dedup slug ${base}`)
}

function fetchToFile(url, destPath) {
  return new Promise((resolveP, rejectP) => {
    httpsGet(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // follow one redirect
        return fetchToFile(res.headers.location, destPath).then(resolveP).catch(rejectP)
      }
      if (res.statusCode !== 200) {
        return rejectP(new Error(`${url} → HTTP ${res.statusCode}`))
      }
      mkdirSync(dirname(destPath), { recursive: true })
      const out = createWriteStream(destPath)
      pipeline(res, out).then(resolveP).catch(rejectP)
    }).on('error', rejectP)
  })
}

async function main() {
  const raw = readFileSync(INV_PATH, 'utf8')
  const inv = JSON.parse(raw)
  if (!inv.categories) throw new Error('inventory missing categories[]')

  let totalDownloaded = 0
  let totalSkipped = 0
  let totalProducts = 0
  const groupBlocks = []

  for (const cat of inv.categories) {
    const catSlug = slugify(cat.slug || cat.name)
    const catLabel = cat.name // Spanish kept as group heading per Q1 lock-in
    const productSlugs = new Set()
    const optionLines = []

    for (const p of cat.products) {
      totalProducts++
      const baseSlug = slugify(p.name)
      const prodSlug = dedupSlug(baseSlug, productSlugs)
      const imgUrl = p.image_url || p.fallback_src
      if (!imgUrl) {
        console.error(`SKIP ${cat.slug}/${p.name}: no image_url`)
        continue
      }
      const localPath = join(PUBLIC_DIR, catSlug, `${prodSlug}.png`)
      const publicHref = `/catalog/wall-paneling/${catSlug}/${prodSlug}.png`

      if (existsSync(localPath) && statSync(localPath).size > 0) {
        totalSkipped++
      } else {
        try {
          await fetchToFile(imgUrl, localPath)
          totalDownloaded++
          console.error(`DL ${catSlug}/${prodSlug}.png`)
        } catch (e) {
          console.error(`FAIL ${cat.slug}/${p.name}: ${e.message}`)
          continue
        }
      }

      // label="" intentional — names stripped per Rod-directive. Vendor fills.
      optionLines.push(`          { id: '${prodSlug}', label: '', image_url: '${publicHref}' },`)
    }

    groupBlocks.push(
      [
        `      {`,
        `        id: '${catSlug}',`,
        `        label: ${JSON.stringify(catLabel)},`,
        `        required: false,`,
        `        type: 'multi',`,
        `        options: [`,
        ...optionLines,
        `        ],`,
        `      },`,
      ].join('\n'),
    )
  }

  console.error(`\nDOWNLOAD SUMMARY: products=${totalProducts} downloaded=${totalDownloaded} skipped=${totalSkipped}`)
  console.error(`Output: ${PUBLIC_DIR}\n`)
  console.error('--- paste below into src/lib/constants.ts wall_paneling.optionGroups ---\n')

  // stdout = the block to paste
  process.stdout.write(`    optionGroups: [\n${groupBlocks.join('\n')}\n    ],\n`)
}

main().catch((e) => {
  console.error('BUILD FAILED:', e.message)
  process.exit(1)
})
