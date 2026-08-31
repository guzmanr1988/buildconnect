#!/usr/bin/env node
// task_643 verification — kratos flagged that the calendar-empty-month bug is only
// visible near end of a month, so any mid-month test passes without exercising the
// fix. This script pins the clock and asserts three cases against the same
// generator + init logic used in the app.
//
//   (a) 2026-08-31 end-of-month: pre-fix opens on empty August; post-fix opens on September.
//   (b) 2026-09-10 mid-month: opens on September, does not jump anywhere unexpected.
//   (c) empty slot set: falls back to today's month so nav still works.

function generateAvailableSlots(now) {
  const allTimes = [
    ['09:00', '10:00', '11:00', '14:00', '15:00'],
    ['09:00', '10:00', '13:00', '14:00'],
    ['10:00', '11:00', '14:00', '15:00', '16:00'],
    ['09:00', '11:00', '14:00'],
    ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'],
  ]
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() + 3 + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: dateStr, times: allTimes[i % allTimes.length] }
  })
}

function pickInitialView(slots, now) {
  const firstAvailable = slots.reduce(
    (min, s) => (min === null || s.date < min ? s.date : min),
    null,
  )
  const seed = firstAvailable ? new Date(firstAvailable + 'T12:00:00') : new Date(now)
  return { month: seed.getMonth(), year: seed.getFullYear() }
}

function preFixInitialView(now) {
  return { month: now.getMonth(), year: now.getFullYear() }
}

function countSelectableInMonth(slots, month, year) {
  return slots.filter((s) => {
    const [y, m] = s.date.split('-').map(Number)
    return y === year && m === month + 1
  }).length
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function label(v) {
  return `${MONTHS[v.month]} ${v.year}`
}

const cases = [
  {
    name: '(a) end-of-month 2026-08-31',
    now: new Date('2026-08-31T14:00:00Z'),
    expectPre: { month: 7, year: 2026 },
    expectPost: { month: 8, year: 2026 },
    expectSelectableInPostView: 12,
  },
  {
    name: '(b) mid-month 2026-09-10',
    now: new Date('2026-09-10T14:00:00Z'),
    expectPre: { month: 8, year: 2026 },
    expectPost: { month: 8, year: 2026 },
    expectSelectableInPostView: 12,
  },
]

let failed = 0

for (const c of cases) {
  const slots = generateAvailableSlots(c.now)
  const pre = preFixInitialView(c.now)
  const post = pickInitialView(slots, c.now)
  const preSelectable = countSelectableInMonth(slots, pre.month, pre.year)
  const postSelectable = countSelectableInMonth(slots, post.month, post.year)

  const preOk = pre.month === c.expectPre.month && pre.year === c.expectPre.year
  const postOk = post.month === c.expectPost.month && post.year === c.expectPost.year
  const selectableOk = postSelectable === c.expectSelectableInPostView

  console.log(`\n== ${c.name} ==`)
  console.log(`  now              = ${c.now.toISOString()}`)
  console.log(`  first slot       = ${slots[0].date}`)
  console.log(`  last slot        = ${slots[slots.length - 1].date}`)
  console.log(`  pre-fix opens on = ${label(pre)}  selectable=${preSelectable}  ${preOk ? 'OK' : 'FAIL'}`)
  console.log(`  post-fix opens on= ${label(post)} selectable=${postSelectable} ${postOk && selectableOk ? 'OK' : 'FAIL'}`)

  if (!preOk || !postOk || !selectableOk) failed++
}

// Case (c): empty slot fallback — pickInitialView must fall back to `now`, so nav
// isn't stuck. Selectable count is 0 regardless (the calendar renders and can be
// navigated even though nothing is clickable — that's the intended behavior when
// no availability exists at all).
{
  const now = new Date('2026-08-31T14:00:00Z')
  const post = pickInitialView([], now)
  const ok = post.month === now.getMonth() && post.year === now.getFullYear()
  console.log(`\n== (c) empty slot set ==`)
  console.log(`  now             = ${now.toISOString()}`)
  console.log(`  post-fix opens on = ${label(post)}  ${ok ? 'OK (fallback matches today)' : 'FAIL'}`)
  if (!ok) failed++
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `FAILED ${failed}`}`)
process.exit(failed === 0 ? 0 : 1)
