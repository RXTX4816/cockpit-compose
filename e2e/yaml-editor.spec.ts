import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';

const COMPOSE_DIR = '/home/test/testcompose';

test.beforeEach(async ({ pluginPage: page }) => {
  await page.getByRole('button', { name: 'Import' }).click();
  const scanInput = page.getByLabel('Compose directory');
  await scanInput.fill(COMPOSE_DIR);
  await scanInput.press('Enter');
  await page.locator('#dss-name-gotify').waitFor({ timeout: 15000 });
  await page.locator('[data-status="down"]')
    .filter({ has: page.locator('#dss-name-gotify') })
    .getByRole('button', { name: 'Edit compose file' })
    .click();
  // The modal opens in read-only mode; click Edit to enable editing and show Save/Cancel
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
});

test('YAML editor modal opens', async ({ pluginPage: page }) => {
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('editor contains YAML content', async ({ pluginPage: page }) => {
  const modal = page.getByRole('dialog');
  await expect(modal.locator('.cm-editor')).toBeVisible();
  await expect(modal.locator('.cm-content')).toContainText('gotify');
});

test('Save button is present', async ({ pluginPage: page }) => {
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
});

test('Cancel exits edit mode without closing the modal', async ({ pluginPage: page }) => {
  await page.getByRole('button', { name: 'Cancel' }).click();
  // Modal stays open but returns to read-only — Save button is gone
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
});

test('closing the modal returns to the main view', async ({ pluginPage: page }) => {
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compose Stacks' })).toBeVisible();
});
