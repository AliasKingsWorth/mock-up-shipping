import { chromium } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMockServer } from '../server/server.mjs'

const dir = await mkdtemp(path.join(os.tmpdir(), 'counter-double-submit-'))
const server = createMockServer({ dataFile: path.join(dir, 'state.json') })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  await page.goto(base)
  await page.locator('[data-view="receiving"]').click()
  await page.locator('.customer-create summary').click()
  await page.locator('#new-name').fill('Duplicate Walk-In')
  await page.locator('#new-phone').fill('+1 305 555 0100')
  await page.getByRole('button', { name: 'Create customer & select account' }).dblclick()
  await page.waitForTimeout(500)
  const response = await page.request.get(`${base}/api/mock/bootstrap`)
  const db = await response.json()
  const count = db.customers.filter(item => item.name === 'Duplicate Walk-In').length
  if (count !== 1) throw new Error(`Double-click created ${count} walk-in accounts`)
  console.log('Counter double-submit audit passed: one walk-in account created.')
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  const resolved = path.resolve(dir)
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Refusing to remove unexpected test directory')
  await rm(resolved, { recursive: true, force: true })
}
