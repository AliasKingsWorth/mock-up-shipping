import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
const sessionLifetime = 8 * 60 * 60 * 1000
export const staffEmail = 'desk@example.test'
const demoCustomers = new Map([['ana@example.test', 'cus_ana'], ['miguel@example.test', 'cus_miguel']])

function failure(status, message) { return Object.assign(new Error(message), { status }) }

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw failure(400, 'Use a password between 10 and 128 characters.')
  }
  const salt = randomBytes(16).toString('hex')
  const key = await deriveKey(password, salt, 64)
  return salt + ':' + key.toString('hex')
}

export function createAuth() {
  const sessions = new Map()
  const attempts = new Map()
  // Fixture credentials are independent of persisted customer profiles.
  const customerHash = hashPassword('CustomerDemo24!')
  const staffHash = hashPassword(process.env.DEMO_STAFF_PASSWORD || 'StaffDemo24!')
  const cookieFlags = '; Path=/; HttpOnly; SameSite=Lax' + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
  const tokenFrom = req => req.headers.cookie?.match(/(?:^|;\s*)freight_session=([a-f0-9]{64})(?:;|$)/)?.[1]
  const cleanup = setInterval(() => {
    for (const map of [sessions, attempts]) for (const [key, item] of map) if (item.expires <= Date.now()) map.delete(key)
  }, 60000)
  cleanup.unref()

  return {
    close() { clearInterval(cleanup) },
    current(req) {
      const item = sessions.get(tokenFrom(req))
      return item && item.expires > Date.now() ? item.identity : null
    },
    start(req, res, identity) {
      sessions.delete(tokenFrom(req))
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { identity, expires: Date.now() + sessionLifetime })
      res.setHeader('Set-Cookie', 'freight_session=' + token + '; Max-Age=' + sessionLifetime / 1000 + cookieFlags)
    },
    end(req, res) {
      sessions.delete(tokenFrom(req))
      res.setHeader('Set-Cookie', 'freight_session=; Max-Age=0' + cookieFlags)
    },
    async login(db, input, ip) {
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
      if (typeof input.password !== 'string' || input.password.length > 128 || email.length > 160) throw failure(401, 'Incorrect email or password.')
      let attempt = attempts.get(ip)
      if (!attempt || attempt.expires <= Date.now()) {
        attempt = { count: 0, expires: Date.now() + 600000 }
        attempts.set(ip, attempt)
      }
      if (attempt.count >= 20) throw failure(429, 'Too many sign-in attempts. Try again in ten minutes.')
      attempt.count++
      let identity, stored
      if (input.role === 'staff' && email === staffEmail) {
        identity = { role: 'staff' }
        stored = await staffHash
      } else if (input.role === 'customer') {
        const customer = db.customers.find(item => item.email?.toLowerCase() === email)
        if (customer) {
          stored = db.passwords?.[customer.id]
          if (!stored && demoCustomers.get(email) === customer.id) stored = await customerHash
          if (stored) identity = { role: 'customer', customerId: customer.id }
        }
      }
      const [salt, digest] = (stored || await customerHash).split(':')
      const key = await deriveKey(input.password, salt, 64)
      if (!timingSafeEqual(key, Buffer.from(digest, 'hex')) || !identity) throw failure(401, 'Incorrect email or password.')
      attempt.count--
      return identity
    }
  }
}
