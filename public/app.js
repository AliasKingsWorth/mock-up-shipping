const $ = selector => document.querySelector(selector)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const miamiToday = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}` }
const stamp = value => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const title = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
const S = { view: 'customer', customerId: 'cus_ana', tab: 'packages', selectedPackageId: null, label: null, receipt: null, quote: null, pickupId: null, photos: [], searchResult: null, newCustomer: null, bootstrap: null, dashboard: null, queue: null, cameraStream: null, scanTimer: null }

async function api(path, options = {}) {
  const response = await fetch(`/api/mock${path}`, { ...options, headers: { 'content-type': 'application/json', ...options.headers } })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status })
  return data
}
async function refresh() {
  S.bootstrap = await api('/bootstrap')
  S.dashboard = await api(`/customers/${S.customerId}/dashboard`)
  S.queue = await api('/receiving/queue')
  $('#company-name').textContent = S.bootstrap.config.companyName
  const persona = $('#persona')
  persona.replaceChildren(...S.bootstrap.customers.map(customer => {
    const option = document.createElement('option')
    option.value = customer.id
    option.textContent = customer.name
    return option
  }))
  persona.value = S.customerId
  render()
}
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3500) }
function error(error) {
  const message = error.message || String(error)
  if (message === 'Label not found') return toast('We could not find that QR label. Check the code or generate a new sticker.')
  if (message === 'No package found') return toast('No received box matches that code. Try its label or carrier reference.')
  if (message === 'Failed to fetch') return toast('The local demo server is unavailable. Check that it is running and try again.')
  toast(message)
}
function field(name, label, type = 'text', value = '', extra = '') { return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>` }
function badge(value) { return `<span class="badge ${escapeHtml(value)}">${escapeHtml(title(value))}</span>` }
function sectionHead(heading, actions = '') {
  return `<div class="page-head"><h1>${heading}</h1><div class="head-actions">${actions}</div></div>`
}
function addressSummary(customer) {
  return `<div class="address-title"><h2>Honduras delivery address</h2><button type="button" class="text-button" data-edit-address="${escapeHtml(customer.id)}">${customer.deliveryAddress ? 'Edit address' : 'Add address'}</button></div><p class="address-lines">${escapeHtml(customer.deliveryAddress || 'No delivery address on file.')}</p>`
}
function render() {
  stopCamera()
  if (!S.bootstrap || !S.dashboard || !S.queue) return
  for (const button of document.querySelectorAll('.nav-link')) {
    const active = button.dataset.view === S.view
    button.classList.toggle('active', active)
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  $('#persona').hidden = S.view !== 'customer'
  $('#app').innerHTML = S.view === 'customer' ? customerView() : S.view === 'receiving' ? receivingView() : setupView()
  if (S.view === 'customer') enhanceCustomerView()
  if (S.view === 'receiving') enhanceReceivingView()
}
function enhanceCustomerView() {
  $('#pu-date').min = miamiToday()
  const empty = $('.activity-grid .empty')
  if (empty) empty.textContent = S.tab === 'packages' ? 'Your first box will show here after its Miami scan.' : S.tab === 'prealerts' ? 'No expected deliveries. Choose Announce a package to add one.' : 'No collections requested.'
}
function showLoadError(loadError) {
  error(loadError)
  $('#app').innerHTML = '<div class="load-error"><span class="eyebrow">DEMO CONNECTION</span><h1>We could not open the demo just now.</h1><p>Your saved data is still in the local mock server. Check that it is running, then try again.</p><button class="btn btn-primary" data-action="retry">Try again</button></div>'
}
function customerView() {
  const { customer, packages, prealerts, pickups, quotes } = S.dashboard
  const selected = packages.find(item => item.id === S.selectedPackageId) || packages[0]
  S.selectedPackageId = selected?.id || null
  return `${sectionHead(escapeHtml(customer.name), '<button class="btn btn-secondary" data-open-dialog="collection-dialog">Request collection</button><button class="btn btn-primary" data-open-dialog="prealert-dialog">Announce a package</button>')}
  <div class="account-addresses">
    <section class="address-card"><div class="address-title"><h2>Miami receiving address</h2><button class="text-button" data-action="copy-address">Copy address + code</button></div>
      <p>${escapeHtml(S.bootstrap.config.miamiAddress)}</p><small>Mark each box <strong>${escapeHtml(customer.accountCode)}</strong> · ${escapeHtml(S.bootstrap.config.receivingHours)}</small></section>
    <section class="delivery-summary">${addressSummary(customer)}</section>
  </div>
  <div class="grid grid-wide section-space activity-grid ${S.tab === 'packages' && selected ? '' : 'list-only'}"><div class="card"><div class="card-head card-pad" style="padding-bottom:0"><div><h2>Shipment activity</h2></div></div><div class="tabs" aria-label="Package activity"><button class="tab ${S.tab === 'packages' ? 'active' : ''}" data-tab="packages" aria-pressed="${S.tab === 'packages'}">Packages (${packages.length})</button><button class="tab ${S.tab === 'prealerts' ? 'active' : ''}" data-tab="prealerts" aria-pressed="${S.tab === 'prealerts'}">Expected (${prealerts.length})</button><button class="tab ${S.tab === 'pickups' ? 'active' : ''}" data-tab="pickups" aria-pressed="${S.tab === 'pickups'}">Collections (${pickups.length})</button></div>${S.tab === 'packages' ? packages.map(item => `<button class="package-row ${item.id === selected?.id ? 'selected' : ''}" data-package="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.contents)} · ${escapeHtml(item.carrier)}</small></span><span class="right">${badge(item.state)}<small>${date(item.receivedAt)}</small></span></button>`).join('') || '<div class="empty">Your first box will appear here after the Miami team scans it.</div>' : S.tab === 'prealerts' ? prealerts.map(item => `<div class="package-row"><span><strong>${escapeHtml(item.contents)}</strong><small>${escapeHtml(item.carrier)} · ${escapeHtml(item.tracking)}</small></span><span class="right">${badge(item.status)}<small>Expected ${date(item.expectedDate)}</small></span></div>`).join('') || '<div class="empty">No boxes expected yet. Add a seller delivery below.</div>' : pickups.map(item => `<div class="package-row"><span><strong>${escapeHtml(item.address)}</strong><small>${escapeHtml(item.packageCount)} package(s) · ${date(item.requestedDate)}</small></span><span class="right">${badge(item.status)}<small>${escapeHtml(item.id)}</small></span></div>`).join('') || '<div class="empty">No collection planned. Request one below.</div>'}</div>
  ${selected && S.tab === 'packages' ? `<div class="card journey">${packageDetail(selected, quotes)}</div>` : ''}</div>
  <dialog id="prealert-dialog" aria-labelledby="prealert-title"><div class="dialog-head"><h2 id="prealert-title">Announce a package</h2><button class="text-button" data-action="close-dialog">Cancel</button></div><form id="prealert-form" class="form-grid">${field('pa-carrier', 'Carrier', 'text', '', 'required placeholder="UPS, FedEx, Amazon…"')}${field('pa-tracking', 'Carrier tracking number', 'text', '', 'required placeholder="1Z…"')}<div class="field full"><label for="pa-contents">Box contents</label><input id="pa-contents" name="contents" required placeholder="e.g. books and stationery"></div><div class="field"><label for="pa-mode">Preferred freight</label><select id="pa-mode" name="mode"><option value="air">Air</option><option value="ocean">Ocean</option></select></div>${field('pa-date', 'Expected at Miami', 'date', '', 'required')}<div class="field full"><div class="form-actions"><button class="btn btn-primary" type="submit">Save pre-alert</button></div></div></form></dialog>
  <dialog id="collection-dialog" aria-labelledby="collection-title"><div class="dialog-head"><h2 id="collection-title">South Florida collection</h2><button class="text-button" data-action="close-dialog">Cancel</button></div><form id="pickup-form" class="form-grid"><div class="field full"><label for="pu-address">Collection address</label><input id="pu-address" name="address" required placeholder="Street, city, ZIP in South Florida"></div>${field('pu-name', 'Contact name', 'text', customer.name, 'required')}${field('pu-phone', 'Contact phone', 'tel', customer.phone, 'required')}${field('pu-date', 'Requested date', 'date', '', 'required')}${field('pu-count', 'Number of boxes', 'number', 1, 'required min="1" max="1000"')}<div class="field full"><label for="pu-notes">Instructions</label><textarea id="pu-notes" name="notes" placeholder="Gate code, pickup window, box details…"></textarea></div><div class="field full"><div class="form-actions"><button class="btn btn-primary" type="submit">Send collection request</button></div></div></form></dialog>`
}
function packageDetail(pkg, quotes) {
  const quote = quotes.find(item => item.packageId === pkg.id)
  return `<div class="detail-title"><div><h2>${escapeHtml(pkg.label)}</h2><p>${escapeHtml(pkg.contents)}</p></div>${badge(pkg.state)}</div><div class="fact-grid"><div class="fact"><small>Carrier tracking</small><strong>${escapeHtml(pkg.tracking || 'Counter drop-off')}</strong></div><div class="fact"><small>Freight preference</small><strong>${title(pkg.mode)}</strong></div><div class="fact"><small>Weight / dimensions</small><strong>${pkg.weightGrams ? `${(pkg.weightGrams / 1000).toFixed(2)} kg · ${(pkg.dimensionsCm || []).join(' × ')} cm` : 'Awaiting measurement'}</strong></div><div class="fact"><small>Condition / location</small><strong>${escapeHtml(pkg.condition || '—')} · ${escapeHtml(pkg.shelf || 'In transit')}</strong></div>${pkg.deliveryAddress ? `<div class="fact"><small>Delivery address at intake</small><strong class="address-lines">${escapeHtml(pkg.deliveryAddress)}</strong></div>` : ''}</div>${quote ? `<div class="notice">Draft freight estimate: <strong>${money(quote.amountUsdCents)}</strong> · ${escapeHtml(quote.id)}</div>` : ''}${pkg.photos?.length ? `<div class="photo-strip">${pkg.photos.map(src => `<img src="${src}" alt="Receiving photo">`).join('')}</div>` : ''}<h3 class="subheading">Tracking history</h3><div class="timeline">${(pkg.events || []).slice().reverse().map(event => `<div class="timeline-item"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p><small>${stamp(event.at)} · ${escapeHtml(event.location)}</small></div>`).join('')}</div>`
}
function receivingView() {
  const customers = S.bootstrap.customers
  const queue = S.queue
  return `${sectionHead('Receiving desk', '<button class="btn btn-secondary" data-action="refresh">Refresh queue</button>')}
  <div class="grid grid-wide receiving-grid"><div class="card card-pad intake-card"><div class="card-head"><h2>Receive a package</h2></div>
  ${S.newCustomer ? `<div class="new-customer-notice" role="status"><strong>${escapeHtml(S.newCustomer.name)} · ${escapeHtml(S.newCustomer.accountCode)}</strong><span>Account created and selected for this box. Generate its QR label below.</span></div>` : ''}
  <details class="customer-create"><summary>Create a walk-in account</summary><form id="customer-create-form" class="form-grid"><div class="field"><label for="new-kind">Account type</label><select id="new-kind" name="kind"><option value="individual">Individual</option><option value="business">Business</option></select></div>${field('new-name', 'Customer or business name', 'text', '', 'required maxlength="120" autocomplete="name"')}${field('new-phone', 'Contact phone', 'tel', '', 'required maxlength="60" autocomplete="tel"')}${field('new-email', 'Email (optional)', 'email', '', 'maxlength="160" autocomplete="email"')}<div class="field full"><label for="new-delivery">Honduras delivery address (optional)</label><textarea id="new-delivery" name="deliveryAddress" maxlength="600" placeholder="Street or colonia, city and department"></textarea></div><div class="field full"><div class="form-actions"><button class="btn btn-primary" type="submit">Create customer &amp; select account</button></div></div></form></details>
  <form id="receipt-form"><div class="form-grid"><div class="field"><label for="rc-account">Customer account</label><select id="rc-account" name="accountCode">${customers.map(item => `<option value="${escapeHtml(item.accountCode)}" ${item.id === S.customerId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.accountCode)}</option>`).join('')}</select></div><div class="field"><label for="rc-source">Receiving source</label><select id="rc-source" name="source"><option value="dropoff">Customer counter drop-off</option><option value="pickup">South Florida collection</option></select></div><div class="desk-address field full"></div><div class="field full" id="pickup-choice" hidden><label for="rc-pickup">Collected pickup</label><select id="rc-pickup" name="pickupId"><option value="">Select collected request</option>${queue.pickups.filter(item => item.status === 'collected').map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(item.address)}</option>`).join('')}</select><span class="hint">Mark the request collected before receiving its boxes.</span></div><div class="field full"><label for="rc-label">Package label / QR payload</label><div class="search-row"><input id="rc-label" name="label" value="${escapeHtml(S.label?.label || '')}" required placeholder="Generate label or scan existing QR"><button type="button" class="btn btn-light" data-action="generate-label">Generate QR</button></div></div>${field('rc-carrier', 'Carrier / source', 'text', '', 'required placeholder="Walk-in customer, UPS, FedEx…"')}${field('rc-tracking', 'Seller or collection reference', 'text', '', 'required placeholder="Counter reference or carrier tracking"')}<div class="field full"><label for="rc-contents">Box contents</label><input id="rc-contents" name="contents" required placeholder="Short description visible to the customer"></div><div class="field"><label for="rc-mode">Freight preference</label><select id="rc-mode" name="mode"><option value="air">Air</option><option value="ocean">Ocean</option></select></div><div class="field"><label for="rc-shelf">Miami shelf / bin</label><input id="rc-shelf" name="shelf" required placeholder="e.g. A-12"></div>${field('rc-weight', 'Measured weight (kg)', 'number', '', 'required min="0.01" step="0.01"')}${field('rc-length', 'Length (cm)', 'number', '', 'required min="1" step="0.1"')}${field('rc-width', 'Width (cm)', 'number', '', 'required min="1" step="0.1"')}${field('rc-height', 'Height (cm)', 'number', '', 'required min="1" step="0.1"')}<div class="field full"><label for="rc-condition">Outer box condition</label><input id="rc-condition" name="condition" required value="Intact" placeholder="Document tears, wet spots, dents…"></div><div class="field full"><label for="rc-photos">Receiving photos (up to 2)</label><input id="rc-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple><span class="hint">Photos are resized and saved in local demo data.</span><div id="photo-previews" class="photo-previews">${S.photos.map(src => `<img src="${src}" alt="Receiving photo preview">`).join('')}</div></div></div><div class="form-actions"><button class="btn btn-primary" type="submit">Confirm receipt</button></div></form>
  ${S.label ? `<div class="label-preview"><img src="${S.label.qr}" alt="QR code for ${escapeHtml(S.label.label)}"><div><small>PRINTABLE PACKAGE LABEL</small><strong>${escapeHtml(S.label.label)}</strong><span>${escapeHtml(S.label.customerName)} · ${escapeHtml(S.label.accountCode)}</span><br><button class="btn btn-secondary btn-small" data-action="print-label">Print sticker</button></div></div>` : ''}
  ${S.receipt ? `<div class="receipt"><h3>Initial receiving receipt</h3><div class="line"><span>Receipt</span><strong>${escapeHtml(S.receipt.receiptNo)}</strong></div><div class="line"><span>Package / account</span><strong>${escapeHtml(S.receipt.label)} · ${escapeHtml(S.receipt.accountCode)}</strong></div><div class="line"><span>Delivery address at intake</span><strong class="address-lines">${escapeHtml(S.receipt.deliveryAddress || 'Not recorded')}</strong></div><div class="line"><span>Received / shelf</span><strong>${stamp(S.receipt.receivedAt)} · ${escapeHtml(S.receipt.shelf)}</strong></div><div class="line"><span>Weight / condition</span><strong>${(S.receipt.weightGrams / 1000).toFixed(2)} kg · ${escapeHtml(S.receipt.condition)}</strong></div><div class="form-actions"><button class="btn btn-secondary btn-small" data-action="print-receipt">Print receipt</button><button class="btn btn-primary btn-small" data-action="create-quote">Create draft quote</button></div>${S.quote ? `<div class="notice"><strong>${escapeHtml(S.quote.id)} · ${money(S.quote.amountUsdCents)}</strong><br>${escapeHtml(S.quote.mode)} · ${S.quote.basis} ${S.quote.mode === 'air' ? 'kg' : 'm³'} × $${S.quote.rate}<br>${escapeHtml(S.quote.note)}</div>` : ''}</div>` : ''}
  </div><div class="grid" style="align-content:start"><div class="card card-pad"><div class="card-head"><div><h2>Scan lookup</h2><p>Find a received box by label or carrier tracking.</p></div></div><form id="lookup-form" class="search-row"><input class="search-input" name="label" required placeholder="PKG-1048 or tracking number"><button class="btn btn-secondary">Find</button></form>${S.searchResult ? `<div class="notice"><strong>${escapeHtml(S.searchResult.label)}</strong> · ${escapeHtml(S.searchResult.contents)}<br>Shelf: ${escapeHtml(S.searchResult.shelf || 'In transit')} · ${title(S.searchResult.state)}</div>` : ''}</div><div class="card card-pad"><div class="card-head"><div><h2>Collections to receive</h2><p>Confirm pickup before warehouse intake.</p></div></div>${queue.pickups.length ? queue.pickups.map(item => `<div class="mini-item"><span><strong>${escapeHtml(item.address)}</strong><small>${escapeHtml(item.id)} · ${item.packageCount} box(es) · ${date(item.requestedDate)}</small></span>${item.status === 'requested' ? `<button class="btn btn-light btn-small" data-collect="${escapeHtml(item.id)}">Mark collected</button>` : badge(item.status)}</div>`).join('') : '<div class="empty">No collection requests yet.</div>'}</div><div class="card card-pad"><div class="card-head"><div><h2>Recently received</h2><p>Current boxes on Miami shelves.</p></div>${badge('received')}</div>${queue.packages.slice(0, 5).map(item => `<div class="mini-item"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.contents)} · shelf ${escapeHtml(item.shelf)}</small></span><small>${date(item.receivedAt)}</small></div>`).join('') || '<div class="empty">No boxes received.</div>'}</div></div></div>`
}
function setupView() {
  const c = S.bootstrap.config
  return `${sectionHead('Receiving setup')}
  <div class="grid grid-wide"><div class="card card-pad"><div class="card-head"><div><h2>Company and warehouse</h2><p>These settings appear in the customer and receiving pages.</p></div></div><form id="setup-form" class="form-grid">${field('cfg-name', 'Company display name', 'text', c.companyName, 'required')}${field('cfg-phone', 'Support phone', 'text', c.supportPhone, 'required')}${field('cfg-email', 'Support email', 'email', c.supportEmail, 'required')} ${field('cfg-branch', 'Honduras branch label', 'text', c.hondurasBranch, 'required')}<div class="field full"><label for="cfg-address">Miami receiving address</label><input id="cfg-address" name="miamiAddress" value="${escapeHtml(c.miamiAddress)}" required></div><div class="field full"><label for="cfg-hours">Receiving hours</label><input id="cfg-hours" name="receivingHours" value="${escapeHtml(c.receivingHours)}" required></div>${field('cfg-prefix', 'New label prefix', 'text', c.labelPrefix, 'required')}<div class="field full"><label for="cfg-note">Receiving instructions</label><textarea id="cfg-note" name="receivingNote">${escapeHtml(c.receivingNote)}</textarea></div>${field('cfg-air', 'Air rate · USD per kg', 'number', c.airRateUsdPerKg, 'required min="0.01" step="0.01"')}${field('cfg-ocean', 'Ocean rate · USD per m³', 'number', c.oceanRateUsdPerCbm, 'required min="0.01" step="0.01"')}${field('cfg-minimum', 'Minimum draft quote · USD', 'number', c.minimumQuoteUsd, 'required min="0.01" step="0.01"')}<div class="field full"><div class="form-actions"><button class="btn btn-primary">Save demo settings</button></div></div></form></div>
  <div class="grid" style="align-content:start"><div class="card card-pad"><div class="card-head"><div><h2>Demo data</h2><p>Stored in this project folder, shared across browser reloads.</p></div></div><div class="mini-item"><span>Customers</span><strong>${S.bootstrap.customers.length}</strong></div><div class="mini-item"><span>Packages</span><strong>${S.dashboard.packages.length} for selected customer</strong></div><div class="mini-item"><span>Sample personas</span><strong>Ana + Miguel</strong></div><div class="notice warn">This mockup uses local JSON data and has no real sign-in, carrier connection, billing, or live scheduling.</div><div class="form-actions"><button class="btn btn-secondary" data-action="reset">Restore sample data</button></div></div></div></div>`
}

function enhanceReceivingView() {
  const form = $('#receipt-form')
  const collections = [...document.querySelectorAll('.card')].find(card => card.querySelector('h2')?.textContent === 'Collections to receive')
  if (collections) collections.id = 'collections-queue'
  const queueLink = document.createElement('a')
  queueLink.className = 'btn btn-secondary'
  queueLink.href = '#collections-queue'
  queueLink.textContent = 'View collections'
  $('.head-actions').prepend(queueLink)
  $('#lookup-form input').placeholder = 'Label or tracking number'
  for (const [id, heading] of [['rc-label', 'Package identification'], ['rc-shelf', 'Measurements and storage']]) {
    const section = document.createElement('h3')
    section.className = 'intake-section'
    section.textContent = heading
    $(`#${id}`).closest('.field').before(section)
  }
  const tracking = $('#rc-tracking')
  tracking.required = false
  tracking.placeholder = 'Optional for walk-in drop-off'
  const scan = document.createElement('button')
  scan.type = 'button'
  scan.className = 'btn btn-secondary'
  scan.dataset.action = 'use-label'
  scan.textContent = 'Use scanned label'
  form.querySelector('#rc-label').parentElement.append(scan)
  const hint = document.createElement('span')
  hint.className = 'hint'
  hint.textContent = 'Scan the printed QR into this field and press Enter, or select Use scanned label.'
  form.querySelector('#rc-label').closest('.field').append(hint)
  const scanner = document.createElement('div')
  scanner.className = 'qr-scanner'
  scanner.innerHTML = '<div class="scan-actions"><button type="button" class="btn btn-light btn-small" data-action="start-camera">Scan with camera</button><button type="button" class="btn btn-secondary btn-small" data-action="scan-image">Scan image file</button><button type="button" class="btn btn-secondary btn-small" data-action="stop-camera" hidden>Stop camera</button><input type="file" id="qr-file" accept="image/*" hidden></div><video id="qr-video" autoplay playsinline muted hidden></video>'
  form.querySelector('#rc-label').closest('.field').append(scanner)
  updatePickupOptions()
  if (S.receipt) $('#rc-label').value = ''

  const recent = [...document.querySelectorAll('.card')].find(card => card.querySelector('h2')?.textContent === 'Recently received')
  recent?.querySelectorAll('.mini-item').forEach((row, index) => {
    const pkg = S.queue.packages[index]
    if (!pkg) return
    const button = document.createElement('button')
    button.className = 'btn btn-light btn-small'
    button.dataset.openPackage = pkg.label
    button.textContent = 'Open'
    row.append(button)
  })
  collections?.querySelectorAll('.mini-item').forEach((row, index) => {
    const pickup = S.queue.pickups[index]
    if (!pickup) return
    const count = S.queue.packages.filter(pkg => pkg.pickupId === pickup.id).length
    row.querySelector('small').textContent += ` · ${count}/${pickup.packageCount} received`
  })
  const receipt = document.querySelector('.receipt')
  if (receipt && S.receipt) {
    form.hidden = true
    $('.customer-create').hidden = true
    if ($('.new-customer-notice')) $('.new-customer-notice').hidden = true
    scanner.hidden = true
    form.closest('.card').querySelector('.card-head h2').textContent = 'Saved receiving record'
    const details = document.createElement('div')
    details.className = 'line'
    details.innerHTML = `<span>Source / contents</span><strong>${S.receipt.source === 'pickup' ? 'South Florida collection' : 'Counter drop-off'} · ${escapeHtml(S.receipt.contents)}</strong>`
    receipt.querySelector('.form-actions').before(details)
    if (S.receipt.photos?.length) {
      const strip = document.createElement('div')
      strip.className = 'photo-strip'
      strip.innerHTML = S.receipt.photos.map(src => `<img src="${src}" alt="Receiving photo">`).join('')
      receipt.querySelector('.form-actions').before(strip)
    }
    if (S.quote) {
      const button = document.createElement('button')
      button.className = 'btn btn-secondary btn-small'
      button.dataset.action = 'print-quote'
      button.textContent = 'Print quote'
      receipt.querySelector('.form-actions').append(button)
      receipt.querySelector('[data-action="create-quote"]').textContent = 'View draft quote'
    }
    const fresh = document.createElement('button')
    fresh.className = 'btn btn-light btn-small'
    fresh.dataset.action = 'new-intake'
    fresh.textContent = 'Receive another box'
    receipt.querySelector('.form-actions').append(fresh)
  }
}

function updatePickupOptions() {
  const source = $('#rc-source')
  const select = $('#rc-pickup')
  if (!source || !select) return
  const customer = S.bootstrap.customers.find(item => item.accountCode === $('#rc-account').value)
  if (customer) $('.desk-address').innerHTML = addressSummary(customer)
  const previous = select.value
  const available = S.queue.pickups.filter(item => item.status === 'collected' && item.customerId === customer?.id)
  select.innerHTML = `<option value="">Select collected request</option>${available.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)} · ${escapeHtml(item.address)}</option>`).join('')}`
  if (available.some(item => item.id === previous)) select.value = previous
  $('#pickup-choice').hidden = source.value !== 'pickup'
  select.required = source.value === 'pickup'
}

function showLabelPreview() {
  const form = $('#receipt-form')
  form.parentElement.querySelectorAll('.label-preview').forEach(node => node.remove())
  if (!S.label) return
  const holder = document.createElement('div')
  holder.className = 'label-preview'
  holder.innerHTML = `<img src="${S.label.qr}" alt="QR code for ${escapeHtml(S.label.label)}"><div><small>PRINTABLE PACKAGE LABEL</small><strong>${escapeHtml(S.label.label)}</strong><span>${escapeHtml(S.label.customerName)} · ${escapeHtml(S.label.accountCode)}</span><br><button class="btn btn-secondary btn-small" data-action="print-label">Print sticker</button></div>`
  form.after(holder)
}

async function openPackage(label) {
  const pkg = await api(`/receiving/lookup?label=${encodeURIComponent(label)}`)
  S.receipt = pkg
  S.customerId = pkg.customerId
  S.searchResult = pkg
  S.quote = await api(`/quotes/${encodeURIComponent(pkg.id)}`).catch(error => {
    if (error.status === 404) return null
    throw error
  })
  S.label = await api(`/labels/${encodeURIComponent(pkg.label)}`)
  await refresh()
}

async function refreshReceivingPreservingForm({ accountCode = null, resetLabel = false } = {}) {
  const form = $('#receipt-form')
  const values = form ? Object.fromEntries(new FormData(form)) : null
  await refresh()
  if (!values || S.view !== 'receiving') return
  const next = $('#receipt-form')
  for (const [name, value] of Object.entries(values)) {
    if (name === 'accountCode' || name === 'source' || name === 'pickupId' || (resetLabel && name === 'label')) continue
    const input = next.elements.namedItem(name)
    if (input && typeof value === 'string') input.value = value
  }
  next.elements.namedItem('accountCode').value = accountCode || values.accountCode
  if (resetLabel) next.elements.namedItem('label').value = ''
  next.elements.namedItem('source').value = values.source
  updatePickupOptions()
  next.elements.namedItem('pickupId').value = values.pickupId || ''
}

function stopCamera() {
  if (S.scanTimer) clearTimeout(S.scanTimer)
  S.scanTimer = null
  S.cameraStream?.getTracks().forEach(track => track.stop())
  S.cameraStream = null
  const video = $('#qr-video')
  if (video) { video.srcObject = null; video.hidden = true }
  const stop = document.querySelector('[data-action="stop-camera"]')
  if (stop) stop.hidden = true
}

function decodeQr(canvas) {
  if (typeof window.jsQR !== 'function') throw new Error('QR reader is unavailable')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return window.jsQR(image.data, image.width, image.height)?.data || null
}

async function scanImage(file) {
  if (!file?.type.startsWith('image/')) throw new Error('Choose a photo of the QR label')
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    const code = decodeQr(canvas)
    if (!code) throw new Error('No readable QR code found in that image')
    $('#rc-label').value = code
    document.querySelector('[data-action="use-label"]')?.click()
  } finally { image.close() }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a camera here. Use an image file or USB scanner.')
  stopCamera()
  const video = $('#qr-video')
  S.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
  if (!video.isConnected) { stopCamera(); return }
  video.srcObject = S.cameraStream
  video.hidden = false
  document.querySelector('[data-action="stop-camera"]').hidden = false
  await video.play()
  const scanFrame = () => {
    if (!S.cameraStream || !video.isConnected) return
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        const code = decodeQr(canvas)
        if (code) {
          stopCamera()
          $('#rc-label').value = code
          document.querySelector('[data-action="use-label"]')?.click()
          return
        }
      } catch (scanError) { stopCamera(); error(scanError); return }
    }
    S.scanTimer = setTimeout(scanFrame, 180)
  }
  scanFrame()
}

document.addEventListener('click', async event => {
  const opener = event.target.closest('[data-open-dialog]')
  if (opener) { document.getElementById(opener.dataset.openDialog).showModal(); return }
  const edit = event.target.closest('[data-edit-address]')
  if (edit) {
    const customer = S.bootstrap.customers.find(item => item.id === edit.dataset.editAddress)
    const form = $('#delivery-form')
    form.dataset.customerId = customer.id
    form.querySelector('.form-error').textContent = ''
    $('#delivery-account').textContent = customer.name + ' · ' + customer.accountCode
    $('#delivery-address').value = customer.deliveryAddress || ''
    $('#delivery-editor').showModal()
    $('#delivery-address').focus()
    return
  }
  const nav = event.target.closest('[data-view]')
  if (nav) { S.view = nav.dataset.view; render(); return }
  const tab = event.target.closest('[data-tab]')
  if (tab) { S.tab = tab.dataset.tab; render(); return }
  const pkg = event.target.closest('[data-package]')
  if (pkg) { S.selectedPackageId = pkg.dataset.package; render(); return }
  const collect = event.target.closest('[data-collect]')
  if (collect) {
    collect.disabled = true
    collect.textContent = 'Saving…'
    try {
      const pickup = await api(`/pickups/${collect.dataset.collect}/collect`, { method: 'POST', body: '{}' })
      S.queue.pickups = S.queue.pickups.map(item => item.id === pickup.id ? pickup : item)
      collect.outerHTML = badge(pickup.status)
      updatePickupOptions()
      toast('Collection marked as collected. Select it in the intake form.')
    } catch (e) { collect.disabled = false; collect.textContent = 'Mark collected'; error(e) }
    return
  }
  const open = event.target.closest('[data-open-package]')
  if (open) { try { await openPackage(open.dataset.openPackage); toast('Saved receipt opened') } catch (e) { error(e) }; return }
  const action = event.target.closest('[data-action]')?.dataset.action
  if (!action) return
  try {
    if (action === 'close-dialog') event.target.closest('dialog').close()
    if (action === 'open-portal') { S.view = 'customer'; render() }
    if (action === 'retry') await refresh()
    if (action === 'copy-address') {
      await navigator.clipboard.writeText(`${S.bootstrap.config.miamiAddress}\nAccount: ${S.dashboard.customer.accountCode}`)
      const button = event.target.closest('button')
      const original = button.textContent
      button.textContent = 'Copied address'
      setTimeout(() => { if (button.isConnected) button.textContent = original }, 1200)
      toast('Miami address and account code copied')
    }
    if (action === 'refresh') { await refreshReceivingPreservingForm(); toast('Queue refreshed') }
    if (action === 'start-camera') { try { await startCamera() } catch (cameraError) { stopCamera(); throw cameraError } }
    if (action === 'stop-camera') { stopCamera(); toast('Camera stopped') }
    if (action === 'scan-image') $('#qr-file').click()
    if (action === 'generate-label') {
      const account = $('#rc-account').value
      const customer = S.bootstrap.customers.find(item => item.accountCode === account)
      S.label = await api('/labels', { method: 'POST', body: JSON.stringify({ customerId: customer.id }) })
      $('#rc-label').value = S.label.label
      showLabelPreview()
      toast('QR label generated. Print and attach it to the box.')
    }
    if (action === 'use-label') {
      const value = $('#rc-label').value.trim()
      if (!value) throw new Error('Scan or enter a package label first')
      try {
        await openPackage(value)
        toast('This box is already received. The saved receipt is open.')
      } catch (lookupError) {
        if (lookupError.status !== 404) throw lookupError
        S.label = await api(`/labels/${encodeURIComponent(value)}`)
        S.receipt = S.quote = null
        $('#rc-account').value = S.label.accountCode
        $('#rc-label').value = S.label.label
        updatePickupOptions()
        showLabelPreview()
        toast('Scanned label matched to its customer. Complete the receiving form.')
      }
    }
    if (action === 'print-label') printContent(`<div style="font:16px Arial;width:340px;text-align:center;border:2px solid currentColor;padding:15px"><strong style="font-size:24px">${escapeHtml(S.label.label)}</strong><br><img src="${S.label.qr}" width="220" height="220"><br>${escapeHtml(S.label.customerName)}<br><strong>${escapeHtml(S.label.accountCode)}</strong><br>Miami receiving</div>`)
    if (action === 'print-receipt') { const p = S.receipt; printContent(`<div style="font:14px Arial;width:430px"><h2>Initial receiving receipt</h2><p>${escapeHtml(S.bootstrap.config.companyName)}</p><hr><p>Receipt: <strong>${escapeHtml(p.receiptNo)}</strong></p><p>Package: ${escapeHtml(p.label)}<br>Account: ${escapeHtml(p.accountCode)}<br>Delivery address at intake: <span style="white-space:pre-line">${escapeHtml(p.deliveryAddress || 'Not recorded')}</span><br>Received: ${stamp(p.receivedAt)}<br>Shelf: ${escapeHtml(p.shelf)}<br>Contents: ${escapeHtml(p.contents)}<br>Weight: ${(p.weightGrams / 1000).toFixed(2)} kg<br>Condition: ${escapeHtml(p.condition)}</p><hr><small>Demo receipt · not proof of freight payment</small></div>`) }
    if (action === 'print-quote') { const q = S.quote; const p = S.receipt; printContent(`<div style="font:14px Arial;width:480px"><h2>Draft freight quotation</h2><p>${escapeHtml(S.bootstrap.config.companyName)} · ${escapeHtml(q.id)}</p><hr><p>Customer account: ${escapeHtml(p.accountCode)}<br>Package: ${escapeHtml(p.label)}<br>Contents: ${escapeHtml(p.contents)}<br>Service: ${title(q.mode)}<br>Measured basis: ${q.basis} ${q.mode === 'air' ? 'kg' : 'm³'}<br>Rate: $${q.rate} per ${q.mode === 'air' ? 'kg' : 'm³'}</p><h2>Total estimate: ${money(q.amountUsdCents)}</h2><hr><small>${escapeHtml(q.note)}</small></div>`) }
    if (action === 'create-quote') {
      if (S.quote) { document.querySelector('.receipt .notice')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast('Draft quote is shown below') }
      else { S.quote = await api('/quotes', { method: 'POST', body: JSON.stringify({ packageId: S.receipt.id }) }); await refresh(); toast('Draft quote created') }
    }
    if (action === 'new-intake') { S.label = S.receipt = S.quote = S.searchResult = S.newCustomer = null; S.photos = []; render(); $('#rc-account').focus() }
    if (action === 'reset') { if (!confirm('Restore the original sample customers and packages? This removes all demo changes.')) return; await api('/reset', { method: 'POST', body: '{}' }); S.label = S.receipt = S.quote = S.newCustomer = null; S.customerId = 'cus_ana'; await refresh(); toast('Sample data restored') }
  } catch (e) { error(e) }
})
document.addEventListener('change', async event => {
  if (event.target.id === 'persona') {
    const workspace = $('#app')
    workspace.inert = true
    workspace.setAttribute('aria-busy', 'true')
    try {
      S.customerId = event.target.value
      S.selectedPackageId = S.receipt = S.quote = S.label = S.searchResult = S.newCustomer = null
      S.photos = []
      S.tab = 'packages'
      await refresh()
    }
    catch (switchError) { error(switchError) }
    finally { workspace.inert = false; workspace.removeAttribute('aria-busy') }
  }
  if (event.target.id === 'rc-source') updatePickupOptions()
  if (event.target.id === 'rc-account') {
    if (S.newCustomer && S.newCustomer.accountCode !== event.target.value) {
      S.newCustomer = null
      if ($('.new-customer-notice')) $('.new-customer-notice').remove()
    }
    if (S.label && S.label.accountCode !== event.target.value) {
      if ($('#rc-label').value === S.label.label) $('#rc-label').value = ''
      S.label = null
      showLabelPreview()
    }
    updatePickupOptions()
  }
  if (event.target.id === 'qr-file') {
    try { await scanImage(event.target.files?.[0]) }
    catch (scanError) { error(scanError) }
    event.target.value = ''
  }
  if (event.target.id === 'rc-photos') {
    try {
      const files = [...event.target.files]
      if (files.length > 2) throw new Error('Choose at most two photos')
      S.photos = await Promise.all(files.map(resizePhoto))
      $('#photo-previews').innerHTML = S.photos.map(src => `<img src="${src}" alt="Receiving photo preview">`).join('')
    } catch (e) { S.photos = []; error(e) }
  }
})
document.addEventListener('keydown', event => {
  if (event.target.id === 'rc-label' && event.key === 'Enter') {
    event.preventDefault()
    document.querySelector('[data-action="use-label"]')?.click()
  }
})
document.addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.target
  const values = Object.fromEntries(new FormData(form))
  try {
    if (form.id === 'delivery-form') {
      const button = form.querySelector('[type="submit"]')
      if (button.disabled) return
      button.disabled = true
      try {
        const customer = await api(`/customers/${encodeURIComponent(form.dataset.customerId)}/delivery-address`, { method: 'PUT', body: JSON.stringify({ deliveryAddress: values.deliveryAddress }) })
        S.bootstrap.customers = S.bootstrap.customers.map(item => item.id === customer.id ? customer : item)
        if (S.dashboard.customer.id === customer.id) S.dashboard.customer = customer
        const summary = S.view === 'receiving' ? $('.desk-address') : $('.delivery-summary')
        if (summary?.querySelector('[data-edit-address]')?.dataset.editAddress === customer.id) {
          summary.innerHTML = addressSummary(customer)
        }
        if (form.dataset.customerId === customer.id && $('#delivery-editor').open) {
          $('#delivery-editor').close()
          summary?.querySelector('button')?.focus()
        }
        toast('Delivery address saved')
      } catch (saveError) { form.querySelector('.form-error').textContent = saveError.message }
      finally { button.disabled = false }
      return
    }
    if (form.id === 'customer-create-form') {
      const button = form.querySelector('[type="submit"]')
      if (button.disabled) return
      button.disabled = true
      button.textContent = 'Creating account…'
      try {
        const customer = await api('/customers', { method: 'POST', body: JSON.stringify({ kind: values.kind, name: values['new-name'], phone: values['new-phone'], email: values['new-email'], deliveryAddress: values.deliveryAddress }) })
        S.customerId = customer.id
        S.tab = 'packages'
        S.newCustomer = customer
        S.label = S.receipt = S.quote = S.searchResult = null
        await refreshReceivingPreservingForm({ accountCode: customer.accountCode, resetLabel: true })
        $('#rc-account').focus()
        toast(`${customer.name} created. Account ${customer.accountCode} is selected for this box.`)
      } catch (createError) {
        button.disabled = false
        button.textContent = 'Create customer & select account'
        throw createError
      }
    }
    if (form.id === 'prealert-form') {
      await api('/prealerts', { method: 'POST', body: JSON.stringify({ customerId: S.customerId, carrier: values['pa-carrier'], tracking: values['pa-tracking'], contents: values.contents, mode: values.mode, expectedDate: values['pa-date'] }) })
      S.tab = 'prealerts'; toast('Pre-alert saved'); await refresh()
    }
    if (form.id === 'pickup-form') {
      await api('/pickups', { method: 'POST', body: JSON.stringify({ customerId: S.customerId, address: values.address, contactName: values['pu-name'], contactPhone: values['pu-phone'], requestedDate: values['pu-date'], packageCount: Number(values['pu-count']), notes: values.notes }) })
      S.tab = 'pickups'; toast('Collection request saved'); await refresh()
    }
    if (form.id === 'lookup-form') { await openPackage(values.label); toast('Saved package opened') }
    if (form.id === 'receipt-form') {
      const payload = { label: values.label, accountCode: values.accountCode, source: values.source, pickupId: values.pickupId || null, carrier: values['rc-carrier'], tracking: values['rc-tracking'], contents: values.contents, mode: values.mode, shelf: values.shelf, weightGrams: Number(values['rc-weight']) * 1000, dimensionsCm: [Number(values['rc-length']), Number(values['rc-width']), Number(values['rc-height'])], condition: values.condition, photos: S.photos }
      const result = await api('/receipts', { method: 'POST', body: JSON.stringify(payload) })
      S.receipt = result.package; S.quote = null; S.photos = []; S.selectedPackageId = result.package.id
      S.customerId = result.package.customerId
      S.tab = 'packages'
      S.label = await api(`/labels/${encodeURIComponent(result.package.label)}`)
      toast(result.duplicate ? 'Already received — showing original receipt' : 'Box received and tracking updated')
      await refresh()
    }
    if (form.id === 'setup-form') {
      const payload = { companyName: values['cfg-name'], supportPhone: values['cfg-phone'], supportEmail: values['cfg-email'], hondurasBranch: values['cfg-branch'], miamiAddress: values.miamiAddress, receivingHours: values.receivingHours, labelPrefix: values['cfg-prefix'], receivingNote: values.receivingNote, airRateUsdPerKg: Number(values['cfg-air']), oceanRateUsdPerCbm: Number(values['cfg-ocean']), minimumQuoteUsd: Number(values['cfg-minimum']) }
      await api('/config', { method: 'PUT', body: JSON.stringify(payload) }); await refresh(); toast('Demo configuration saved')
    }
  } catch (e) {
    if (form.closest('dialog')) {
      let message = form.querySelector('.form-error')
      if (!message) {
        message = document.createElement('p')
        message.className = 'form-error field full'
        message.setAttribute('role', 'alert')
        form.append(message)
      }
      message.textContent = e.message
    } else { error(e) }
  }
})
async function resizePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPEG, PNG, or WebP photo')
  const image = await createImageBitmap(file)
  const scale = Math.min(1, 900 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close()
  return canvas.toDataURL('image/jpeg', .72)
}
function printContent(markup) {
  const popup = window.open('', '_blank', 'width=600,height=750')
  if (!popup) throw new Error('Allow popups to print the label or receipt')
  popup.document.write(`<!doctype html><html><head><title>Print</title><meta charset="utf-8"></head><body style="padding:30px">${markup}<script>window.onload=()=>{window.print()}<\/script></body></html>`)
  popup.document.close()
}
refresh().catch(showLoadError)
