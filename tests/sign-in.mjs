export async function signIn(page, base, email = 'ana@example.test', password = 'CustomerDemo24!') {
  const staff = email === 'desk@example.test'
  const target = staff ? '/staff/login' : '/login'
  if (await page.locator('#logout').count()) {
    await page.locator('#logout').click()
    await page.waitForURL(/\/login$/)
  }
  await page.goto(base + target)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(staff ? 'StaffDemo24!' : password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(base + (staff ? '/receiving' : '/portal'))
}
