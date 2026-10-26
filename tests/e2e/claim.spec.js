import { test, expect } from '@playwright/test';
import { attachScreenshot, login, newSession, openTicket, resetAssignments } from '../support/desk.js';

const SUBJECT = 'Invoice export is missing rows';

test.beforeEach(resetAssignments);
test.afterEach(resetAssignments);

const assignment = page => page.getByRole('region', { name: 'Assignment' });

test('Sara claims an unassigned ticket by keyboard and it survives a refresh', async ({ page, request }, testInfo) => {
  await login(page);
  await openTicket(page, SUBJECT);
  await expect(assignment(page).getByRole('status')).toHaveText('Unassigned');
  await attachScreenshot(page, testInfo, '1-unassigned');

  const claim = page.getByRole('button', { name: 'Assign to me' });
  await claim.focus();
  await page.keyboard.press('Enter');
  await expect(assignment(page).getByRole('status')).toHaveText('Assigned to Sara');
  await expect(page.getByRole('button', { name: /Assign/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: SUBJECT, exact: true })).toBeFocused();
  await attachScreenshot(page, testInfo, '2-assigned-to-sara');

  await page.reload();
  await openTicket(page, SUBJECT);
  await expect(assignment(page).getByRole('status')).toHaveText('Assigned to Sara');
  await expect(page.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
  await attachScreenshot(page, testInfo, '3-after-refresh');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const saved = await page.request.get('/api/tickets/1');
  expect(await saved.json()).toMatchObject({ assignee: 'Sara' });
  expect((await request.get('/api/tickets/1')).status()).toBe(401);
});

test('Omar sees a stale claim fail with a clear message, then the real assignee', async ({ page, browser }, testInfo) => {
  const omarContext = await newSession(browser, testInfo);
  const omar = await omarContext.newPage();
  try {
    await login(page);
    await openTicket(page, SUBJECT);
    await login(omar, 'omar@example.test');
    await openTicket(omar, SUBJECT);
    await expect(assignment(page).getByRole('status')).toHaveText('Unassigned');
    await expect(assignment(omar).getByRole('status')).toHaveText('Unassigned');

    await page.getByRole('button', { name: 'Assign to me' }).click();
    await expect(assignment(page).getByRole('status')).toHaveText('Assigned to Sara');

    // Omar's page is stale: it still shows Unassigned and offers the claim.
    await expect(assignment(omar).getByRole('status')).toHaveText('Unassigned');
    await omar.getByRole('button', { name: 'Assign to me' }).click();
    await expect(assignment(omar).getByRole('alert')).toHaveText('This ticket is already assigned to Sara.');
    await expect(omar.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
    await attachScreenshot(omar, testInfo, '1-omar-conflict');

    await omar.getByRole('button', { name: 'Refresh assignment' }).click();
    await expect(assignment(omar).getByRole('status')).toHaveText('Assigned to Sara');
    await expect(assignment(omar).getByRole('alert')).toHaveCount(0);
    await expect(omar.getByRole('button', { name: /Assign|Refresh/ })).toHaveCount(0);
    await attachScreenshot(omar, testInfo, '2-omar-after-refresh');

    const saved = await omar.request.get('/api/tickets/1');
    expect(await saved.json()).toMatchObject({ assignee: 'Sara' });
  } finally {
    await omarContext.close();
  }
});

test('customers see the assignment but cannot claim, even through the API', async ({ page, request }) => {
  await login(page, 'amina@example.test');
  await openTicket(page, SUBJECT);
  await expect(assignment(page).getByRole('status')).toHaveText('Unassigned');
  await expect(page.getByRole('button', { name: /Assign/ })).toHaveCount(0);

  const denied = await page.request.post('/api/tickets/1/assign');
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toEqual({ error: 'Only support agents can assign tickets.' });
  expect((await request.post('/api/tickets/1/assign')).status()).toBe(401);
  expect((await (await page.request.get('/api/tickets/1')).json()).assignee).toBeNull();
});
