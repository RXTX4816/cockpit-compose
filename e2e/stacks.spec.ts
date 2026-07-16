import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, dismissStartupPodmanPrompt } from './helpers/base';
import { downedCard } from './helpers/stacks';

test('Compose Stacks heading is visible', async ({ pluginPage: page }) => {
  await dismissStartupPodmanPrompt(page);
  await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
});

test('scan finds pre-staged stacks', async ({ pluginPage: page }) => {
  await baseData(page);
  // At least one stack card should appear; gotify is always present
  await expect(page.locator('#dss-name-gotify')).toBeVisible();
  await expect(page.locator('.dss-stack-name').first()).toBeVisible();
});

test('each found stack has an Edit compose file button', async ({ pluginPage: page }) => {
  await baseData(page);
  await expect(downedCard(page, 'gotify').getByRole('button', { name: 'Edit compose file' })).toBeVisible();
});
