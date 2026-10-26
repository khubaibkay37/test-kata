import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';

export async function login(page, email = 'sara@example.test', password = 'workshop123') {
  await page.goto('/');
  await expect(page).toHaveTitle('Desk · Support inbox');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function openTicket(page, subject = 'Invoice export is missing rows') {
  await page.getByRole('button', { name: new RegExp(subject) }).click();
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible();
}

// Claims are saved in PostgreSQL, so tests that claim tickets start (and end) from
// "nobody is assigned". This talks to the Compose database, not the app's API,
// because the product deliberately has no way to unassign a ticket.
export function resetAssignments() {
  execFileSync('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'workshop', '-d', 'supportdesk', '-v', 'ON_ERROR_STOP=1', '-c', 'UPDATE tickets SET assignee_id=NULL'], { stdio: 'pipe' });
}

// A second, independent browser session that looks like the project's device.
export function newSession(browser, testInfo) {
  const { baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor } = testInfo.project.use;
  return browser.newContext({ baseURL, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor });
}

export async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
