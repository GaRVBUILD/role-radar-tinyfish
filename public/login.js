const form = document.querySelector('#login-form');
const errorBox = document.querySelector('#login-error');
const submit = document.querySelector('#login-submit');
const userIdInput = document.querySelector('#user-id');
const passwordInput = document.querySelector('#password');

fetch('/api/session').then(response => response.json()).then(data => {
  if (data.authenticated) location.replace('/');
}).catch(() => {});

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.textContent = '';
  submit.disabled = true;
  submit.querySelector('span').textContent = 'Signing in…';
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userIdInput.value.trim(), password: passwordInput.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sign in failed.');
    location.replace('/');
  } catch (error) {
    errorBox.textContent = error.message;
    submit.disabled = false;
    submit.querySelector('span').textContent = 'Enter Role Radar';
  }
});

document.querySelector('#toggle-password').addEventListener('click', event => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  event.currentTarget.textContent = showing ? 'Show' : 'Hide';
  event.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

document.querySelector('#copy-credentials').addEventListener('click', async event => {
  const text = `User ID: ${userIdInput.value}\nPassword: ${passwordInput.value}`;
  try {
    await navigator.clipboard.writeText(text);
    event.currentTarget.textContent = '✓';
    setTimeout(() => { event.currentTarget.textContent = '⧉'; }, 1800);
  } catch {
    errorBox.textContent = 'Copy failed. Use the credentials shown on this page.';
  }
});
