import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createMockServer } from '../server/server.mjs'

test('customer collection, receipt, tracking, quote, and persistence', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'phase1-shipping-'))
  const file = path.join(directory, 'state.json')
  const server = createMockServer({ dataFile: file })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/mock`
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const laterDate = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10)
  try {
    const boot = await request('/bootstrap')
    assert.equal(boot.data.customers.length, 2)
    const created = await request('/customers', 'POST', { kind: 'individual', name: 'Lucía Rivera', phone: '+1 305 555 0111', email: 'lucia@example.test' })
    assert.equal(created.status, 201)
    assert.match(created.data.accountCode, /^MIA-C\d{4}$/)
    assert.equal((await request('/bootstrap')).data.customers.length, 3)
    assert.equal((await request('/customers', 'POST', { name: 'Duplicate', phone: '3055550122', email: 'LUCIA@example.test' })).status, 409)
    assert.equal((await request('/customers', 'POST', { name: 'Lucía Rivera', phone: '3055550111' })).status, 409)
    const createdLabel = await request('/labels', 'POST', { customerId: created.data.id })
    const addressRoute = `/customers/${created.data.id}/delivery-address`
    const destination = 'Casa 7, Colonia Ejemplo\nLa Ceiba, Atlántida'
    assert.equal((await request(addressRoute, 'PUT', { deliveryAddress: ' ' })).status, 400)
    assert.equal((await request(addressRoute, 'PUT', { deliveryAddress: destination })).data.deliveryAddress, destination)
    const createdReceipt = await request('/receipts', 'POST', { label: createdLabel.data.label, accountCode: created.data.accountCode, source: 'dropoff', carrier: 'Walk-in customer', tracking: '', contents: 'Family gifts', mode: 'air', weightGrams: 1000, dimensionsCm: [20, 20, 20], condition: 'Intact', shelf: 'A-03', photos: [] })
    assert.equal(createdReceipt.status, 201)
    assert.equal(createdReceipt.data.package.deliveryAddress, destination)
    await request(addressRoute, 'PUT', { deliveryAddress: 'Nueva dirección, La Ceiba' })
    assert.equal((await request(`/customers/${created.data.id}/dashboard`)).data.packages[0].label, createdLabel.data.label)
    assert.equal((await request('/customers/cus_ana/dashboard')).data.packages.some(item => item.id === createdReceipt.data.package.id), false)
    const alert = await request('/prealerts', 'POST', { customerId: 'cus_ana', carrier: 'UPS', tracking: 'TEST-123', contents: 'Camera', mode: 'air', expectedDate: futureDate })
    assert.equal(alert.status, 201)
    const pickup = await request('/pickups', 'POST', { customerId: 'cus_ana', address: '123 Main St, Miami, FL', contactName: 'Ana', contactPhone: '3055551111', requestedDate: futureDate, packageCount: 1 })
    assert.equal(pickup.status, 201)
    const pastDate = await request('/pickups', 'POST', { customerId: 'cus_ana', address: '123 Main St, Miami, FL', contactName: 'Ana', contactPhone: '3055551111', requestedDate: '2020-01-01', packageCount: 1 })
    assert.equal(pastDate.status, 400)
    const label = await request('/labels', 'POST', { customerId: 'cus_ana' })
    assert.match(label.data.qr, /^data:image\/png;base64,/)
    const reprint = await request(`/labels/${label.data.label}`)
    assert.equal(reprint.data.label, label.data.label)
    const wrongAccount = await request('/receipts', 'POST', { label: label.data.label, accountCode: 'MIA-MIG02', source: 'dropoff', carrier: 'UPS', tracking: 'TEST-123', contents: 'Camera', mode: 'air', weightGrams: 2000, dimensionsCm: [30, 20, 15], condition: 'Intact', shelf: 'A-01', photos: [] })
    assert.equal(wrongAccount.status, 409)
    const uncollected = await request('/receipts', 'POST', { label: label.data.label, accountCode: 'MIA-ANA01', source: 'pickup', pickupId: pickup.data.id, carrier: 'UPS', tracking: 'TEST-123', contents: 'Camera', mode: 'air', weightGrams: 2000, dimensionsCm: [30, 20, 15], condition: 'Intact', shelf: 'A-01', photos: [] })
    assert.equal(uncollected.status, 400)
    await request(`/pickups/${pickup.data.id}/collect`, 'POST', {})
    const input = { label: label.data.label, accountCode: 'MIA-ANA01', source: 'pickup', pickupId: pickup.data.id, carrier: 'UPS', tracking: 'TEST-123', contents: 'Camera', mode: 'air', weightGrams: 2000, dimensionsCm: [30, 20, 15], condition: 'Intact', shelf: 'A-01', photos: [] }
    const [first, second] = await Promise.all([request('/receipts', 'POST', input), request('/receipts', 'POST', input)])
    assert.deepEqual([first.status, second.status].sort(), [200, 201])
    assert.equal(first.data.package.id, second.data.package.id)
    assert.equal(first.data.package.events.length, 1)
    const pkg = first.data.package
    const collectionAfterReceipt = await request('/receiving/queue')
    assert.equal(collectionAfterReceipt.data.pickups.find(item => item.id === pickup.data.id).status, 'received')
    const overCountLabel = await request('/labels', 'POST', { customerId: 'cus_ana' })
    const overCount = await request('/receipts', 'POST', { ...input, label: overCountLabel.data.label, tracking: 'SECOND-BOX' })
    assert.equal(overCount.status, 400)
    const quote = await request('/quotes', 'POST', { packageId: pkg.id })
    assert.equal(quote.data.amountUsdCents, 1800)
    assert.equal((await request(`/quotes/${pkg.id}`)).data.id, quote.data.id)
    assert.equal((await request('/quotes', 'POST', { packageId: pkg.id })).data.id, quote.data.id)
    const walkInLabel = await request('/labels', 'POST', { customerId: 'cus_miguel' })
    const walkIn = await request('/receipts', 'POST', { label: walkInLabel.data.label, accountCode: 'MIA-MIG02', source: 'dropoff', carrier: 'Walk-in customer', tracking: '', contents: 'Shoes', mode: 'ocean', weightGrams: 1500, dimensionsCm: [30, 25, 20], condition: 'Intact', shelf: 'B-10', photos: [] })
    assert.equal(walkIn.status, 201)
    assert.equal(walkIn.data.package.tracking, null)
    const reprintWalkIn = await request(`/labels/${walkInLabel.data.label}`)
    assert.match(reprintWalkIn.data.qr, /^data:image\/png;base64,/)
    const invalidPhotos = await request('/receipts', 'POST', { ...input, label: 'BAD-PHOTO', source: 'dropoff', photos: ['data:text/plain;base64,QQ=='] })
    assert.equal(invalidPhotos.status, 400)
    const twoBoxPickup = await request('/pickups', 'POST', { customerId: 'cus_miguel', address: '44 Demo Ave, Hialeah, FL', contactName: 'Miguel', contactPhone: '3055552222', requestedDate: laterDate, packageCount: 2 })
    await request(`/pickups/${twoBoxPickup.data.id}/collect`, 'POST', {})
    const pickupInput = { accountCode: 'MIA-MIG02', source: 'pickup', pickupId: twoBoxPickup.data.id, carrier: 'Collection team', tracking: '', contents: 'Household items', mode: 'ocean', weightGrams: 1200, dimensionsCm: [20, 20, 20], condition: 'Intact', shelf: 'B-11', photos: [] }
    const boxOne = await request('/labels', 'POST', { customerId: 'cus_miguel' })
    assert.equal((await request('/receipts', 'POST', { ...pickupInput, label: boxOne.data.label })).status, 201)
    assert.equal((await request('/receiving/queue')).data.pickups.find(item => item.id === twoBoxPickup.data.id).status, 'collected')
    const boxTwo = await request('/labels', 'POST', { customerId: 'cus_miguel' })
    assert.equal((await request('/receipts', 'POST', { ...pickupInput, label: boxTwo.data.label })).status, 201)
    assert.equal((await request('/receiving/queue')).data.pickups.find(item => item.id === twoBoxPickup.data.id).status, 'received')
    const own = await request(`/packages/${pkg.id}?customerId=cus_ana`)
    assert.equal(own.status, 200)
    const other = await request(`/packages/${pkg.id}?customerId=cus_miguel`)
    assert.equal(other.status, 404)
    const dashboard = await request('/customers/cus_ana/dashboard')
    assert.equal(dashboard.data.packages.filter(item => item.id === pkg.id).length, 1)
    assert.equal(dashboard.data.prealerts.find(item => item.id === alert.data.id).status, 'received')
    await new Promise(resolve => server.close(resolve))
    const reopened = createMockServer({ dataFile: file })
    await new Promise(resolve => reopened.listen(0, '127.0.0.1', resolve))
    try {
      const response = await fetch(`http://127.0.0.1:${reopened.address().port}/api/mock/customers/cus_ana/dashboard`)
      const persisted = await response.json()
      assert.ok(persisted.packages.some(item => item.id === pkg.id))
      const createdAfterRestart = await fetch(`http://127.0.0.1:${reopened.address().port}/api/mock/customers/${created.data.id}/dashboard`).then(response => response.json())
      assert.equal(createdAfterRestart.customer.accountCode, created.data.accountCode)
      assert.equal(createdAfterRestart.customer.deliveryAddress, 'Nueva dirección, La Ceiba')
      assert.equal(createdAfterRestart.packages[0].deliveryAddress, destination)
      assert.equal(createdAfterRestart.packages[0].label, createdLabel.data.label)
    } finally { await new Promise(resolve => reopened.close(resolve)) }
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve))
    const resolved = path.resolve(directory)
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Refusing to remove unexpected test directory')
    await rm(resolved, { recursive: true, force: true })
  }
})
