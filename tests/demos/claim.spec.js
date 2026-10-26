import { test, expect } from '@playwright/test';
import { login, openTicket, resetAssignments } from '../support/desk.js';

// Normal runs pause in Playwright Inspector. Automatic mode (DESK_DEMO_AUTO=1)
// runs the same checks without waiting for the presenter.
const automatic = process.env.DESK_DEMO_AUTO === '1';
const SUBJECT = 'Invoice export is missing rows';

async function pause(page, message) {
  console.log(`PAUSE: ${message}`);
  if (!automatic) await page.pause();
}

test('show how an agent claims a ticket and a colleague sees it', async ({ page, browser }) => {
  resetAssignments();
  const assignment = p => p.getByRole('region', { name: 'Assignment' });

  await test.step('Sara opens an unassigned ticket', async () => {
    await login(page);
    await openTicket(page, SUBJECT);
    await expect(assignment(page).getByRole('status')).toHaveText('Unassigned');
    await pause(page, 'Ticket #1 is Unassigned and Sara is offered Assign to me. Resume to claim it.');
  });

  await test.step('Sara claims it', async () => {
    await page.getByRole('button', { name: 'Assign to me' }).click();
    await expect(assignment(page).getByRole('status')).toHaveText('Assigned to Sara');
    await expect(page.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
    await pause(page, 'The assignment is saved: it says Assigned to Sara and the button is gone. Resume to refresh.');
  });

  await test.step('The assignment survives a refresh', async () => {
    await page.reload();
    await openTicket(page, SUBJECT);
    await expect(assignment(page).getByRole('status')).toHaveText('Assigned to Sara');
    await pause(page, 'After a full page refresh it still says Assigned to Sara. Resume to sign in as Omar.');
  });

  await test.step('Omar sees Sara as the assignee and cannot replace her', async () => {
    const omarContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1280, height: 800 } });
    const omar = await omarContext.newPage();
    await login(omar, 'omar@example.test');
    await openTicket(omar, SUBJECT);
    await expect(assignment(omar).getByRole('status')).toHaveText('Assigned to Sara');
    await expect(omar.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
    expect((await omar.request.post('/api/tickets/1/assign')).status()).toBe(409);
    await pause(omar, 'Omar sees Assigned to Sara with no claim button, and a direct API claim is refused (409). Resume to finish.');
    await omarContext.close();
  });

  resetAssignments();
});
