const registering = location.pathname === '/register'
const staff = location.pathname === '/staff/login'
const heading = registering ? 'Create customer account' : staff ? 'Staff sign in' : 'Customer sign in'
const main = document.querySelector('#auth')
document.title = heading + ' | Miami ↔ Honduras Freight'

function field(key, label, autocomplete, type = 'text', attributes = 'required') {
  return `<div class="field"><label for="${key}">${label}</label><input id="${key}" name="${key}" type="${type}" autocomplete="${autocomplete}" ${attributes}></div>`
}
const regions = ['Atlántida', 'Choluteca', 'Colón', 'Comayagua', 'Copán', 'Cortés', 'El Paraíso', 'Francisco Morazán', 'Gracias a Dios', 'Intibucá', 'Islas de la Bahía', 'La Paz', 'Lempira', 'Ocotepeque', 'Olancho', 'Santa Bárbara', 'Valle', 'Yoro']
const email = field('email', 'Email address', 'username', 'email', 'required maxlength="160"')
const password = field('password', registering ? 'Create password' : 'Password', registering ? 'new-password' : 'current-password', 'password', registering ? 'required minlength="10" maxlength="128" aria-describedby="password-help"' : 'required maxlength="128"')

function registrationFields() {
  return `<fieldset><legend>Customer details</legend><div class="form-grid">
    ${field('firstName', 'First name', 'given-name', 'text', 'required maxlength="60"')}
    ${field('lastName', 'Last name', 'family-name', 'text', 'required maxlength="60"')}
    ${field('phone', 'Phone number', 'tel', 'tel', 'required maxlength="60"')}
    ${field('company', 'Company (optional)', 'organization', 'text', 'maxlength="120"')}
  </div></fieldset><fieldset><legend>Delivery address</legend><div class="form-grid">
    <div class="field"><label for="country">Destination country</label><select id="country" name="country" autocomplete="country-name"><option>Honduras</option></select></div>
    <div class="field"><label for="region">State / department</label><select id="region" name="region" autocomplete="address-level1" required><option value="">Select department</option>${regions.map(r => `<option>${r}</option>`).join('')}</select></div>
    ${field('city', 'City', 'address-level2', 'text', 'required maxlength="80"')}
    ${field('postalCode', 'Postal code', 'postal-code', 'text', 'required maxlength="16" aria-describedby="postal-help"')}
    <small id="postal-help" class="full">Use 00000 if your address has no postal code.</small>
    ${field('street', 'Street address', 'address-line1', 'text', 'required maxlength="140"')}
    ${field('line2', 'Address line 2 (optional)', 'address-line2', 'text', 'maxlength="80"')}
    ${field('line3', 'Address line 3 (optional)', 'address-line3', 'text', 'maxlength="80"')}
  </div></fieldset><fieldset><legend>Sign-in details</legend>${email}<div class="form-grid">${password}
    ${field('confirmPassword', 'Confirm password', 'new-password', 'password', 'required maxlength="128"')}
    </div><small id="password-help">Use at least 10 characters.</small></fieldset>`
}
if (registering) main.classList.add('register-panel')
main.innerHTML = `<h1>${heading}</h1>
  <p class="auth-intro">${registering ? 'Set up your account to receive and track packages.' : staff ? 'Open the Miami receiving desk.' : 'View your packages and delivery address.'}</p>
  <form>${registering ? registrationFields() : email + password}
    <p class="form-error" role="alert"></p><button class="btn btn-primary">${registering ? 'Create account' : 'Sign in'}</button>
  </form><div class="auth-links">${registering ? '<a href="/login">Back to customer sign in</a>' : staff ? '<a href="/login">Customer sign in</a>' : '<a href="/register">Create customer account</a><a href="/staff/login">Staff sign in</a>'}</div>`
main.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button')
  if (button.disabled) return
  const input = Object.fromEntries(new FormData(form))
  const message = form.querySelector('[role="alert"]')
  if (registering && input.password !== input.confirmPassword) {
    message.textContent = 'Passwords must match.'
    form.elements.confirmPassword.focus()
    return
  }
  button.disabled = true
  message.textContent = ''
  try {
    const response = await fetch('/api/mock/auth/' + (registering ? 'register' : 'login'), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, role: staff ? 'staff' : 'customer' })
    })
    if (!response.ok) throw new Error((await response.json()).error)
    location.replace(staff ? '/receiving' : '/portal')
  } catch (error) {
    message.textContent = error.message === 'Failed to fetch' ? 'Could not reach the server. Try again.' : error.message
  } finally { button.disabled = false }
})
