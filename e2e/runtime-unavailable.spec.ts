import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { sshExec } from './helpers/vm';

/**
 * Regression coverage for docs/testing.md §7.5: neither Docker nor Podman
 * present at all. `arch-docker` never has Podman installed to begin with, so
 * temporarily hiding its real `docker` AND `docker-compose` binaries via SSH
 * (always restored in a `finally`) genuinely reproduces "neither compose
 * tool present" — not a mock. (`docker` alone isn't enough:
 * detectComposeCommand() falls back to the standalone `docker-compose`
 * legacy binary when `docker compose` fails.)
 */
test('With neither runtime installed, the app shows real not-found state instead of hanging or crashing', async ({ pluginPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'arch-docker', 'only arch-docker has no Podman at all, so hiding Docker alone reproduces "neither present"');
  test.setTimeout(60_000);

  // detectComposeCommand() falls back to the standalone `docker-compose`
  // legacy binary if `docker compose` fails — hiding only `docker` still
  // leaves detection satisfied via that fallback, so both must go.
  await sshExec('arch-docker', 'sudo mv /usr/bin/docker /usr/bin/docker.e2e-disabled && sudo mv /usr/bin/docker-compose /usr/bin/docker-compose.e2e-disabled');
  try {
    await page.reload();

    // Docker missing on initial load auto-suggests switching to Podman
    // (App.tsx's dockerMissing -> suggestPodman).
    const suggestModal = page.getByRole('dialog', { name: 'Switch to Podman' });
    await expect(suggestModal).toBeVisible({ timeout: 15000 });
    await expect(suggestModal.getByText('Docker was not found', { exact: false })).toBeVisible();
    await suggestModal.getByRole('button', { name: 'Continue', exact: true }).click();

    // Real effect: switching to Podman ALSO genuinely fails detection here
    // (this VM never had Podman installed) — reverts to Docker with a real
    // "not found" warning, not a silent hang or crash.
    await expect(page.getByText('Podman not found', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute('aria-pressed', 'true');

    // Real effect: the Docker *daemon*/socket is untouched by hiding the CLI
    // binaries (dockerd keeps running), so the socket-mode toggle still
    // correctly shows Rootful as available — but the actual listStacks call
    // genuinely fails since there's no compose CLI left to run it with,
    // surfacing a real error+Retry rather than an empty "nothing running"
    // list that would be indistinguishable from a healthy, idle install.
    await expect(page.getByText('Failed to load stacks', { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  } finally {
    await sshExec('arch-docker', 'sudo mv /usr/bin/docker.e2e-disabled /usr/bin/docker && sudo mv /usr/bin/docker-compose.e2e-disabled /usr/bin/docker-compose');
  }
});
