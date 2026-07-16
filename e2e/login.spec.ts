import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { dismissStartupPodmanPrompt } from './helpers/base';

test('reaches the plugin page', async ({ pluginPage: page }) => {
  await expect(page).toHaveURL(/cockpit-compose/);
  await expect(page.locator('#root')).toBeVisible();
});

test('shows the Compose Stacks heading', async ({ pluginPage: page }) => {
  await dismissStartupPodmanPrompt(page);
  await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
});
