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
