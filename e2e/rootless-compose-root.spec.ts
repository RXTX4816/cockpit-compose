import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { dismissStartupPodmanPrompt } from './helpers/base';

// Only meaningful on podman VMs: docker here always runs rootful
// (see scripts/test-vm.config.sh), so the rootless suggestion never applies there.
test('Create Stack suggests the home directory when rootless and no stacks exist yet', async ({ pluginPage: page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('podman'), 'podman-only: docker VMs here run rootful');

  await dismissStartupPodmanPrompt(page);
  // exact: true — the empty-state's "Create stack" button also substring-matches "Create".
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const dirInput = page.getByLabel('Compose root directory');
  await expect(dirInput).toHaveValue(/^\/home\/test\/compose$/);
});
