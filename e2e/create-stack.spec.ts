import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard } from './helpers/stacks';

const NAME = 'e2e-create-test';
// "Compose root directory" is the *parent* dir — the app creates `{DIR}/{NAME}`
// itself. Passing a path that already included NAME here produced a doubled,
// invalid path ("…/e2e-create-test/e2e-create-test already exists").
const DIR = '/home/test/testcompose';

// Creates a throwaway stack via the "Manual" method (pre-filled stub YAML,
// no network/template dependency), confirms a real compose.yml + directory
// were actually created (not just a UI toast), then deletes it again so the
// test doesn't leave junk behind for other specs/runs.
test('Create Stack (manual method) actually creates a compose file on disk', async ({ pluginPage: page }) => {
  await baseData(page);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#csm-name').fill(NAME);
  await modal.locator('#csm-dir').fill(DIR);
  await modal.getByRole('button', { name: 'Manual' }).click();
  await modal.getByRole('button', { name: 'Next' }).click();
  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(modal).not.toBeVisible({ timeout: 15000 });

  // Real effect: rescan and confirm the new stack directory is actually found on disk.
  await baseData(page);
  await expect(page.locator(`#dss-name-${NAME}`)).toBeVisible({ timeout: 15000 });

  // Clean up: delete it so re-running this test (or others) starts fresh.
  const card = downedCard(page, NAME);
  await card.getByRole('button', { name: 'Delete compose file' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.locator(`#dss-name-${NAME}`)).toHaveCount(0, { timeout: 15000 });
});

const TEMPLATE_NAME = 'e2e-create-template-test';

test('Create Stack (template method) writes the real template YAML to disk, editable before create', async ({ pluginPage: page }) => {
  test.setTimeout(30_000);
  await baseData(page);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#csm-name').fill(TEMPLATE_NAME);
  await modal.locator('#csm-dir').fill(DIR);
  await modal.getByRole('button', { name: 'Template' }).click();
  await modal.getByRole('button', { name: 'Next' }).click();

  await modal.getByText('Minimal', { exact: true }).click();
  // Real content: the editor now shows the actual template YAML, not a blank form.
  await expect(modal.locator('.cm-content')).toContainText('my-app', { timeout: 5000 });

  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(modal).not.toBeVisible({ timeout: 15000 });

  // Real effect: rescan and confirm the file on disk actually contains the template content.
  await baseData(page);
  const card = downedCard(page, TEMPLATE_NAME);
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: 'Edit compose file' }).click({ force: true });
  await expect(page.getByRole('dialog').locator('.cm-content')).toContainText('my-app', { timeout: 10000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Clean up.
  await downedCard(page, TEMPLATE_NAME).getByRole('button', { name: 'Delete compose file' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.locator(`#dss-name-${TEMPLATE_NAME}`)).toHaveCount(0, { timeout: 15000 });
});

test('Create Stack validation: invalid YAML shows a real error count, and Create anyway bypasses it', async ({ pluginPage: page }) => {
  test.setTimeout(30_000);
  await baseData(page);
  const invalidName = 'e2e-create-invalid-test';

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#csm-name').fill(invalidName);
  await modal.locator('#csm-dir').fill(DIR);
  await modal.getByRole('button', { name: 'Manual' }).click();
  await modal.getByRole('button', { name: 'Next' }).click();

  const editor = modal.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('not: valid: yaml: [structure');

  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  // Real validation: a separate confirm dialog with an error count derived
  // from actually parsing the typed YAML, not a generic "something's wrong"
  // banner on the main modal.
  const confirm = page.getByRole('dialog', { name: 'Confirm create' });
  await expect(confirm).toBeVisible({ timeout: 10000 });
  await expect(confirm.getByText(/error/i).first()).toBeVisible();

  await confirm.getByRole('button', { name: 'Create Anyway' }).click();
  await expect(modal).not.toBeVisible({ timeout: 15000 });

  await baseData(page);
  await expect(page.locator(`#dss-name-${invalidName}`)).toBeVisible({ timeout: 15000 });

  // Clean up.
  await downedCard(page, invalidName).getByRole('button', { name: 'Delete compose file' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.locator(`#dss-name-${invalidName}`)).toHaveCount(0, { timeout: 15000 });
});
