import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { createAuth, hashPassword, staffEmail } from './auth.mjs'
import { createFixture } from './fixtures.mjs'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')
const defaultFile = path.join(root, '.local', 'state.json')
const staticFiles = new Map([
  ['/login', ['auth.html', 'text/html; charset=utf-8']],
  ['/register', ['auth.html', 'text/html; charset=utf-8']],
  ['/staff/login', ['auth.html', 'text/html; charset=utf-8']],
  ['/portal', ['index.html', 'text/html; charset=utf-8']],
  ['/receiving', ['index.html', 'text/html; charset=utf-8']],
  ['/auth.js', ['auth.js', 'text/javascript; charset=utf-8']],
  ['/HOW_IT_WORKS.html', ['HOW_IT_WORKS.html', 'text/html; charset=utf-8']],
  ['/preview-intake.png', ['previews/preview-intake.png', 'image/png']],
  ['/previews/preview-intake.png', ['previews/preview-intake.png', 'image/png']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/theme.css', ['theme.css', 'text/css; charset=utf-8']],
  ['/fonts/dm-sans.woff2', [fileURLToPath(import.meta.resolve('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2')), 'font/woff2']],
  ['/fonts/fraunces.woff2', [fileURLToPath(import.meta.resolve('@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2')), 'font/woff2']],
  ['/vendor/jsQR.js', [fileURLToPath(import.meta.resolve('jsqr')), 'text/javascript; charset=utf-8']],
])

export function createMockServer({ dataFile = process.env.MOCK_DATA_FILE || defaultFile } = {}) {
  const auth = createAuth()
  let state
  let loading
  let mutation = Promise.resolve()

  async function load() {
    if (loading) return loading
    if (state) return state
    loading ||= (async () => {
      try { state = JSON.parse(await readFile(dataFile, 'utf8')) }
      catch (error) {
        if (error.code !== 'ENOENT') throw error
        state = createFixture()
        await persist()
      }
      return state
    })().finally(() => { loading = null })
    return loading
  }

  async function persist() {
    await mkdir(path.dirname(dataFile), { recursive: true })
    const temporary = `${dataFile}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2))
    await rename(temporary, dataFile)
  }

  function modify(operation) {
    const next = mutation.then(async () => {
      await load()
      const result = await operation(state)
      await persist()
      return result
    })
    mutation = next.catch(() => {})
    return next
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const send = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    }
    try {
      const route = url.pathname
      const identity = auth.current(req)
      const home = identity?.role === 'staff' ? '/receiving' : '/portal'
      const redirect = location => { res.writeHead(303, { location, 'cache-control': 'no-store' }); res.end() }
      if (req.method === 'GET') {
        if (route === '/' || route === '/index.html') return redirect(identity ? home : '/login')
        if (route === '/portal' || route === '/receiving') {
          if (!identity) return redirect(route === '/receiving' ? '/staff/login' : '/login')
          if (route !== home) return redirect(home)
        }
        if (identity && ['/login', '/staff/login', '/register'].includes(route)) return redirect(home)
      }
      if (req.method === 'GET' && staticFiles.has(route)) {
        const [name, type] = staticFiles.get(url.pathname)
        const content = await readFile(path.resolve(publicDir, name))
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
        res.end(content)
        return
      }
      if (!url.pathname.startsWith('/api/mock/')) return send(404, { error: 'Not found' })
      if (req.method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json') return send(415, { error: 'Send a JSON request.' })
      const db = await load()
      const registering = req.method === 'POST' && route === '/api/mock/auth/register'
      if (req.method === 'POST' && route === '/api/mock/auth/login') {
        const user = await auth.login(db, await readJson(req), req.socket.remoteAddress)
        auth.start(req, res, user)
        return send(200, user)
      }
      if (req.method === 'POST' && route === '/api/mock/auth/logout') {
        auth.end(req, res)
        return send(200, { signedOut: true })
      }
      if (!registering && !identity) return send(401, { error: 'Sign in to continue.' })
      if (req.method === 'GET' && route === '/api/mock/auth/session') return send(200, identity)
      const isStaff = identity?.role === 'staff'
      const own = identity?.customerId
      if (!registering && !isStaff) {
        const permitted = (req.method === 'GET' && (route === '/api/mock/bootstrap' || route === `/api/mock/customers/${own}/dashboard` || route.startsWith('/api/mock/packages/')))
          || (req.method === 'PUT' && route === `/api/mock/customers/${own}/delivery-address`)
          || (req.method === 'POST' && ['/api/mock/prealerts', '/api/mock/pickups'].includes(route))
        if (!permitted) return send(403, { error: 'You do not have access to this operation.' })
      }
      if (req.method === 'GET' && url.pathname === '/api/mock/bootstrap') {
        const { companyName, miamiAddress, receivingHours } = db.config
        const config = isStaff ? db.config : { companyName, miamiAddress, receivingHours }
        const customers = isStaff ? db.customers : db.customers.filter(item => item.id === own)
        return send(200, { config, customers, identity })
      }
      const dashboard = url.pathname.match(/^\/api\/mock\/customers\/([^/]+)\/dashboard$/)
      if (req.method === 'GET' && dashboard) {
        const customer = db.customers.find(item => item.id === dashboard[1])
        if (!customer) return send(404, { error: 'Customer not found' })
        return send(200, {
          customer,
          packages: db.packages.filter(item => item.customerId === customer.id),
          prealerts: db.prealerts.filter(item => item.customerId === customer.id),
          pickups: db.pickups.filter(item => item.customerId === customer.id),
          quotes: db.quotes.filter(item => item.customerId === customer.id),
        })
      }
      const packagePath = url.pathname.match(/^\/api\/mock\/packages\/([^/]+)$/)
      if (req.method === 'GET' && packagePath) {
        const pkg = db.packages.find(item => item.id === packagePath[1] || item.label === packagePath[1] || item.tracking === packagePath[1])
        if (!pkg || (!isStaff && pkg.customerId !== own) || pkg.customerId !== url.searchParams.get('customerId')) return send(404, { error: 'Package not found for this demo customer' })
        return send(200, pkg)
      }
      if (req.method === 'GET' && url.pathname === '/api/mock/receiving/queue') {
        return send(200, {
          packages: db.packages.filter(item => item.state === 'received').slice().reverse(),
          pickups: db.pickups.slice().reverse(),
        })
      }
      const labelPath = url.pathname.match(/^\/api\/mock\/labels\/([^/]+)$/)
      if (req.method === 'GET' && labelPath) {
        const item = (db.labels || []).find(label => label.label.toLowerCase() === decodeURIComponent(labelPath[1]).toLowerCase())
          || (() => {
            const pkg = db.packages.find(pkg => pkg.label.toLowerCase() === decodeURIComponent(labelPath[1]).toLowerCase())
            const customer = db.customers.find(customer => customer.id === pkg?.customerId)
            return pkg && customer ? { label: pkg.label, customerId: customer.id, accountCode: customer.accountCode, customerName: customer.name } : null
          })()
        if (!item) return send(404, { error: 'Label not found' })
        return send(200, { ...item, qr: await QRCode.toDataURL(item.label, { width: 280, margin: 1, errorCorrectionLevel: 'M' }) })
      }
      const quotePath = url.pathname.match(/^\/api\/mock\/quotes\/([^/]+)$/)
      if (req.method === 'GET' && quotePath) {
        const quote = db.quotes.find(item => item.packageId === quotePath[1])
        return quote ? send(200, quote) : send(404, { error: 'No draft quote for this package' })
      }
      if (req.method === 'GET' && url.pathname === '/api/mock/receiving/lookup') {
        const value = url.searchParams.get('label')?.trim().toLowerCase()
        const pkg = db.packages.find(item => item.label.toLowerCase() === value || (value && item.tracking?.toLowerCase() === value))
        return pkg ? send(200, pkg) : send(404, { error: 'No package found' })
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/reset') {
        return send(200, await modify(db => {
          const sample = createFixture()
          const sampleIds = new Set(sample.customers.map(customer => customer.id))
          const keep = item => !sampleIds.has(item.customerId)
          for (const key of ['packages', 'quotes', 'labels', 'prealerts', 'pickups']) {
            db[key] = [...sample[key], ...(db[key] || []).filter(keep)]
          }
          db.customers = [...sample.customers, ...db.customers.filter(customer => !sampleIds.has(customer.id))]
          db.config = sample.config
          return { reset: true }
        }))
      }
      if (!['POST', 'PUT'].includes(req.method)) return send(405, { error: 'Method not allowed' })
      const body = await readJson(req)
      if (!isStaff && !registering && req.method === 'POST' && body.customerId !== own) return send(403, { error: 'Select your own customer account.' })
      const addressRoute = url.pathname.match(/^\/api\/mock\/customers\/([^/]+)\/delivery-address$/)
      if (req.method === 'PUT' && addressRoute) {
        const address = requiredString(body.deliveryAddress, 'Delivery address', 600)
        const customer = await modify(db => {
          const record = findCustomer(db, addressRoute[1])
          record.deliveryAddress = address
          return record
        })
        return send(200, customer)
      }
      if (registering || (req.method === 'POST' && route === '/api/mock/customers')) {
        let profile = {}
        if (registering) {
          if (body.password !== body.confirmPassword) throw httpError(400, 'Passwords must match.')
          const firstName = requiredString(body.firstName, 'First name', 60)
          const lastName = requiredString(body.lastName, 'Last name', 60)
          const company = optionalString(body.company, 'Company', 120)
          const country = choice(body.country, ['Honduras'], 'destination country')
          const region = requiredString(body.region, 'Department', 80)
          const city = requiredString(body.city, 'City', 80)
          const postal = requiredString(body.postalCode, 'Postal code', 16)
          const lines = [requiredString(body.street, 'Street address', 140), optionalString(body.line2, 'Address line 2', 80), optionalString(body.line3, 'Address line 3', 80)]
          profile = { firstName, lastName, company }
          body.name = firstName + ' ' + lastName
          body.kind = company ? 'business' : 'individual'
          body.deliveryAddress = [...lines.filter(Boolean), city + ', ' + region + ' ' + postal, country].join('\n')
        }
        const input = {
          ...profile,
          kind: choice(body.kind || 'individual', ['individual', 'business'], 'kind'),
          name: requiredString(body.name, 'name', 121),
          phone: requiredString(body.phone, 'phone', 60),
          email: optionalString(body.email, 'email', 160),
          deliveryAddress: optionalString(body.deliveryAddress, 'Delivery address', 600),
        }
        if (input.phone.replace(/\D/g, '').length < 7) throw httpError(400, 'Enter a contact phone with at least 7 digits')
        if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw httpError(400, 'Enter a valid email address')
        if (registering && !input.email) throw httpError(400, 'Enter your email address.')
        if (input.email?.toLowerCase() === staffEmail) throw httpError(409, 'This email already has an account.')
        const digest = registering || body.password ? await hashPassword(body.password) : null
        if (digest && !input.email) throw httpError(400, 'An email is required for portal access.')
        const customer = await modify(db => {
          if (db.customers.some(item => item.name.trim().toLowerCase() === input.name.toLowerCase() && normalizedPhone(item.phone) === normalizedPhone(input.phone))) {
            throw httpError(409, 'This customer and phone already have an account. Select the existing account.')
          }
          if (input.email && db.customers.some(item => item.email?.toLowerCase() === input.email.toLowerCase())) {
            throw httpError(409, 'A customer with this email already exists. Select the existing account.')
          }
          let number = db.nextCustomerNumber || 3
          let accountCode
          do { accountCode = `MIA-C${String(number++).padStart(4, '0')}` }
          while (db.customers.some(item => item.accountCode === accountCode))
          db.nextCustomerNumber = number
          const record = { id: `cus_${randomUUID().slice(0, 8)}`, ...input, accountCode, createdAt: new Date().toISOString() }
          if (digest) { db.passwords ||= {}; db.passwords[record.id] = digest }
          db.customers.push(record)
          return record
        })
        if (registering) auth.start(req, res, { role: 'customer', customerId: customer.id })
        return send(201, customer)
      }
      if (req.method === 'PUT' && url.pathname === '/api/mock/config') {
        const allowed = ['companyName', 'supportPhone', 'supportEmail', 'miamiAddress', 'receivingHours', 'hondurasBranch', 'labelPrefix', 'receivingNote']
        const rates = ['airRateUsdPerKg', 'oceanRateUsdPerCbm', 'minimumQuoteUsd']
        const config = {}
        for (const key of allowed) if (body[key] !== undefined) config[key] = requiredString(body[key], key, 250)
        if (config.labelPrefix && !/^[A-Za-z0-9-]{2,12}$/.test(config.labelPrefix)) throw httpError(400, 'labelPrefix must be 2–12 letters, numbers, or hyphens')
        for (const key of rates) if (body[key] !== undefined) config[key] = positiveNumber(body[key], key)
        return send(200, await modify(db => Object.assign(db.config, config)))
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/labels') {
        const customer = findCustomer(db, body.customerId)
        const label = `${db.config.labelPrefix}-${String(Date.now()).slice(-6)}-${randomUUID().slice(0, 6).toUpperCase()}`
        const record = { label, accountCode: customer.accountCode, customerName: customer.name, customerId: customer.id, createdAt: new Date().toISOString() }
        await modify(db => { db.labels ||= []; db.labels.push(record); return record })
        const qr = await QRCode.toDataURL(label, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
        return send(201, { ...record, qr })
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/prealerts') {
        findCustomer(db, body.customerId)
        const input = {
          customerId: body.customerId,
          carrier: requiredString(body.carrier, 'carrier', 80),
          tracking: requiredString(body.tracking, 'tracking', 100),
          contents: requiredString(body.contents, 'contents', 240),
          mode: choice(body.mode, ['air', 'ocean'], 'mode'),
          expectedDate: requiredString(body.expectedDate, 'expectedDate', 20),
        }
        const prealert = { id: `pal_${randomUUID().slice(0, 8)}`, ...input, status: 'expected', createdAt: new Date().toISOString() }
        return send(201, await modify(db => { db.prealerts.push(prealert); return prealert }))
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/pickups') {
        findCustomer(db, body.customerId)
        const requestedDate = requiredString(body.requestedDate, 'requestedDate', 20)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`)) || new Date(`${requestedDate}T00:00:00Z`).toISOString().slice(0, 10) !== requestedDate) throw httpError(400, 'Enter a valid collection date')
        if (requestedDate < miamiToday()) throw httpError(400, 'Choose today or a future date for collection')
        const input = {
          customerId: body.customerId,
          address: requiredString(body.address, 'address', 240),
          contactName: requiredString(body.contactName, 'contactName', 120),
          contactPhone: requiredString(body.contactPhone, 'contactPhone', 60),
          requestedDate,
          packageCount: positiveInteger(body.packageCount, 'packageCount'),
          notes: String(body.notes || '').slice(0, 300),
        }
        const pickup = { id: `pup_${randomUUID().slice(0, 8)}`, ...input, status: 'requested', createdAt: new Date().toISOString() }
        return send(201, await modify(db => { db.pickups.push(pickup); return pickup }))
      }
      const pickupMatch = url.pathname.match(/^\/api\/mock\/pickups\/([^/]+)\/collect$/)
      if (req.method === 'POST' && pickupMatch) {
        const result = await modify(db => {
          const pickup = db.pickups.find(item => item.id === pickupMatch[1])
          if (!pickup) throw httpError(404, 'Pickup not found')
          if (pickup.status === 'requested') { pickup.status = 'collected'; pickup.collectedAt = new Date().toISOString() }
          return pickup
        })
        return send(200, result)
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/receipts') {
        const input = validateReceipt(body)
        const result = await modify(db => {
          const customer = db.customers.find(item => item.accountCode.toLowerCase() === input.accountCode.toLowerCase())
          if (!customer) throw httpError(404, 'Account code not found')
          const existing = db.packages.find(item => item.label === input.label)
          if (existing) {
            if (existing.customerId !== customer.id) throw httpError(409, 'Label belongs to another customer')
            return { package: existing, duplicate: true }
          }
          const reserved = (db.labels || []).find(item => item.label === input.label)
          if (reserved && reserved.customerId !== customer.id) throw httpError(409, 'Label was generated for another customer')
          if (input.pickupId) {
            const pickup = db.pickups.find(item => item.id === input.pickupId && item.customerId === customer.id)
            if (!pickup || pickup.status !== 'collected') throw httpError(400, 'Collect the matching pickup before receiving this box')
            if (db.packages.filter(item => item.pickupId === pickup.id).length >= pickup.packageCount) throw httpError(409, 'All boxes from this collection are already received')
          }
          const now = new Date().toISOString()
          const prealert = input.tracking && db.prealerts.find(item => item.customerId === customer.id && item.tracking.toLowerCase() === input.tracking.toLowerCase())
          if (prealert) prealert.status = 'received'
          const pkg = {
            id: `pkg_${randomUUID().slice(0, 8)}`, ...input, customerId: customer.id,
            deliveryAddress: customer.deliveryAddress || null,
            prealertId: prealert?.id || null, state: 'received', receivedAt: now,
            receiptNo: `RCV-${randomUUID().slice(0, 8).toUpperCase()}`,
            events: [{ kind: 'received', title: 'Received in Miami', detail: `${input.source === 'pickup' ? 'Collected from South Florida and' : 'Dropped off at Miami and'} placed on shelf ${input.shelf}.`, at: now, location: 'Miami warehouse' }],
          }
          db.packages.push(pkg)
          if (input.pickupId) {
            const pickup = db.pickups.find(item => item.id === input.pickupId)
            if (db.packages.filter(item => item.pickupId === pickup.id).length >= pickup.packageCount) { pickup.status = 'received'; pickup.receivedAt = now }
          }
          return { package: pkg, duplicate: false }
        })
        return send(result.duplicate ? 200 : 201, result)
      }
      if (req.method === 'POST' && url.pathname === '/api/mock/quotes') {
        const result = await modify(db => {
          const pkg = db.packages.find(item => item.id === body.packageId)
          if (!pkg) throw httpError(404, 'Package not found')
          const existing = db.quotes.find(item => item.packageId === pkg.id)
          if (existing) return existing
          const kg = pkg.weightGrams / 1000
          const cbm = pkg.dimensionsCm.reduce((a, b) => a * b, 1) / 1_000_000
          const rate = pkg.mode === 'air' ? db.config.airRateUsdPerKg : db.config.oceanRateUsdPerCbm
          const basis = pkg.mode === 'air' ? kg : cbm
          const total = Math.round(Math.max(db.config.minimumQuoteUsd, rate * basis) * 100)
          const quote = { id: `Q-${randomUUID().slice(0, 8).toUpperCase()}`, packageId: pkg.id, customerId: pkg.customerId, mode: pkg.mode, rate, basis: Number(basis.toFixed(4)), amountUsdCents: total, status: 'draft', createdAt: new Date().toISOString(), note: 'Demo estimate only. Final freight charges may change after verification.' }
          db.quotes.push(quote)
          return quote
        })
        return send(201, result)
      }
      return send(404, { error: 'Route not found' })
    } catch (error) {
      send(error.status || 500, { error: error.status ? error.message : 'Mock server error' })
      if (!error.status) console.error(error)
    }
  })
  server.once('close', () => auth.close())
  return server
}

function httpError(status, message) { return Object.assign(new Error(message), { status }) }
function requiredString(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw httpError(400, `${name} is required (max ${max} characters)`)
  return value.trim()
}
function optionalString(value, name, max) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > max) throw httpError(400, `${name} must be at most ${max} characters`)
  return value.trim() || null
}
function choice(value, options, name) { if (!options.includes(value)) throw httpError(400, `Invalid ${name}`); return value }
function positiveNumber(value, name) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${name} must be positive`); return n }
function positiveInteger(value, name) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 1000) throw httpError(400, `${name} must be a positive integer`); return n }
function normalizedPhone(value) { const digits = value.replace(/\D/g, ''); return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits }
function miamiToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
function findCustomer(db, id) { const customer = db.customers.find(item => item.id === id); if (!customer) throw httpError(404, 'Customer not found'); return customer }
function validateReceipt(body) {
  const photos = Array.isArray(body.photos) ? body.photos : []
  if (photos.length > 2 || photos.some(photo => typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 2_000_000)) throw httpError(400, 'Provide at most two JPEG, PNG, or WebP photos under 1.5 MB each')
  if (!Array.isArray(body.dimensionsCm) || body.dimensionsCm.length !== 3) throw httpError(400, 'Three dimensions are required')
  return {
    label: requiredString(body.label, 'label', 80), accountCode: requiredString(body.accountCode, 'accountCode', 60),
    source: choice(body.source, ['dropoff', 'pickup'], 'source'), pickupId: body.source === 'pickup' ? requiredString(body.pickupId, 'pickupId', 80) : null,
    carrier: requiredString(body.carrier, 'carrier', 80), tracking: optionalString(body.tracking, 'tracking', 100),
    contents: requiredString(body.contents, 'contents', 240), mode: choice(body.mode, ['air', 'ocean'], 'mode'),
    weightGrams: positiveNumber(body.weightGrams, 'weightGrams'),
    dimensionsCm: body.dimensionsCm.map((value, index) => positiveNumber(value, `dimension ${index + 1}`)),
    condition: requiredString(body.condition, 'condition', 240), shelf: requiredString(body.shelf, 'shelf', 60), photos,
  }
}
async function readJson(req) {
  let size = 0; const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 6_000_000) throw httpError(413, 'Request is too large')
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw httpError(400, 'Invalid JSON') }
}

export function startMockServer() {
  const server = createMockServer()
  const production = process.env.NODE_ENV === 'production'
  const port = Number(process.env.PORT || process.env.MOCK_PORT || (production ? 3000 : 4175))
  const host = production || process.env.PORT ? '0.0.0.0' : '127.0.0.1'
  server.listen(port, host, () => console.log(`Phase 1 mockup: http://${host}:${server.address().port}`))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMockServer()
}
