import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import type { Page } from '@playwright/test';

const COMPOSE_DIR = '/home/test/testcompose';

export async function openImportAndScan(page: Page) {
  await page.getByRole('button', { name: 'Import' }).click();
  const scanInput = page.getByLabel('Compose directory');
  await scanInput.fill(COMPOSE_DIR);
  await scanInput.press('Enter');
  // Wait for the first stack card to appear — confirms the scan completed
  await page.locator('.dss-stack-name').first().waitFor({ timeout: 15000 });
}

test('Compose Stacks heading is visible', async ({ pluginPage: page }) => {
  await expect(page.getByRole('heading', { name: 'Compose Stacks' })).toBeVisible();
});

test('scan finds pre-staged stacks', async ({ pluginPage: page }) => {
  await openImportAndScan(page);
  // At least one stack card should appear; gotify is always present
  await expect(page.locator('#dss-name-gotify')).toBeVisible();
  await expect(page.locator('.dss-stack-name').first()).toBeVisible();
});

test('each found stack has an Edit compose file button', async ({ pluginPage: page }) => {
  await openImportAndScan(page);
  const gotifyCard = page.locator('[data-status="down"]').filter({ has: page.locator('#dss-name-gotify') });
  await expect(gotifyCard.getByRole('button', { name: 'Edit compose file' })).toBeVisible();
});
