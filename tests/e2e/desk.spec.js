import { test, expect } from '@playwright/test';

async function login(page, email = 'sara@example.test', password = 'workshop123') {
  await page.goto('/');
  await expect(page).toHaveTitle('Desk · Support inbox');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function openTicket(page, subject = 'Invoice export is missing rows') {
  await page.getByRole('button', { name: new RegExp(subject) }).click();
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible();
}

test('login, ticket details, refresh, and logout use the real API', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await expect(page.getByRole('heading', { name: 'Ticket inbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: /#[1-4]/ })).toHaveCount(4);
  await openTicket(page);
  await expect(page.getByText('Our October export stops at row 200.', { exact: false })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Unassigned' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign to me' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ticket-detail.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await openTicket(page, 'Update our billing contact');
  await expect(page.getByText('Account reference: DEMO-204.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid login is recoverable and password visibility is accessible', async ({ page }, testInfo) => {
  await login(page, 'sara@example.test', 'wrong-password');
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('sara@example.test');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.screenshot({ path: testInfo.outputPath('login-error.png'), fullPage: true });
  await page.getByLabel('Password', { exact: true }).fill('workshop123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ticket inbox' })).toBeVisible();
});

test('mobile detail has a working back action; keyboard selection works on desktop', async ({ page }, testInfo) => {
  await login(page);
  const row = page.getByRole('button', { name: /#1 Invoice export/ });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Invoice export is missing rows', exact: true })).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByRole('heading', { name: 'Ticket inbox' })).toBeHidden();
    await page.getByRole('button', { name: 'Back to inbox' }).click();
    await expect(page.getByRole('heading', { name: 'Ticket inbox' })).toBeVisible();
    await expect(row).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [email, customer, ownSubject, hiddenSubject] of [
  [
    "amina@example.test",
    "Amina",
    "Invoice export is missing rows",
    "Update our billing contact",
  ],
  [
    "bilal@example.test",
    "Bilal",
    "Update our billing contact",
    "Invoice export is missing rows",
  ],
]) {
  test(`${customer} sees only their own tickets after login and refresh`, async ({
    page,
  }) => {
    await login(page, email);
    await expect(page.getByRole("button", { name: /#[1-4]/ })).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: new RegExp(hiddenSubject) }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /#[1-4]/ })).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: new RegExp(hiddenSubject) }),
    ).toHaveCount(0);
    await openTicket(page, ownSubject);
    await expect(page.locator(".customer")).toHaveText(
      `${customer} · Customer`,
    );
  });
}

test('failed ticket list offers retry without losing the session', async ({ page }) => {
  await page.route('**/api/tickets', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable. Please try again.' }) }));
  await login(page);
  await expect(page.getByRole('alert')).toHaveText('Temporarily unavailable. Please try again.');
  await page.unroute('**/api/tickets');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Ticket inbox' })).toBeVisible();
});

test('expired session sends the reader back to sign in', async ({ page }) => {
  await login(page);
  await page.route('**/api/tickets/2', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Session expired.' }) }));
  await page.getByRole('button', { name: /Update our billing contact/ }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('session has expired');
});

test('API denies anonymous access and invalidates logged-out sessions', async ({ request }) => {
  expect((await request.get('/api/tickets')).status()).toBe(401);
  expect((await request.get('/api/tickets/1')).status()).toBe(401);
  const signed = await request.post('/api/login', { data: { email: 'sara@example.test', password: 'workshop123' } });
  expect(signed.status()).toBe(200);
  expect((await request.get('/api/tickets/1')).status()).toBe(200);
  expect((await request.get('/api/tickets/9999')).status()).toBe(404);
  const state = await request.storageState();
  await request.post('/api/logout');
  const token = state.cookies.find(cookie => cookie.name === 'desk_session').value;
  expect((await request.get('/api/me', { headers: { Cookie: `desk_session=${token}` } })).status()).toBe(401);
});
