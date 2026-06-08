// Screenshot the login page mobile logo lockup at iPhone-13-mini width 390x844.
// task_1780946246012_061 (Rod-direct via kratos) — mark size-up + horizontal
// center for a brand-anchor mobile header.
const { chromium } = require('playwright')

const PREVIEW_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:4181'

async function main() {
  const browser = await chromium.launch({ headless: true })

  for (const profile of [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'mobile-360', width: 360, height: 800 },
    { name: 'desktop-1280', width: 1280, height: 900 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: profile.width, height: profile.height } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${profile.name}:PAGEERROR]`, e.message))
    await page.goto(`${PREVIEW_URL}/login`, { waitUntil: 'networkidle', timeout: 30_000 })
    // Wait for ANY visible BuildConnect logo (mobile + desktop variants live in
    // the same DOM, gated by lg: classes — locator.first() picks whichever
    // matches the viewport).
    await page.locator('img[alt="BuildConnect"]:visible').first().waitFor({ timeout: 10_000 })
    await page.waitForTimeout(700) // let framer-motion finish
    const path = `/tmp/login-logo-${profile.name}.png`
    await page.screenshot({ path, fullPage: false })
    console.log(`${profile.name.toUpperCase()}=${path}`)
    await ctx.close()
  }

  await browser.close()
  console.log('DONE')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
