import { test, expect } from '@playwright/test';
import { loginWithAdminAccess } from './helpers/admin';
import { baseData, dismissStartupPodmanPrompt } from './helpers/base';
import { downStack, downedCard, ensureDown, stackRow } from './helpers/stacks';

/**
 * Regression coverage for issue #242 and the follow-on rootful-Podman bugs found while
 * fixing it: a Compose project started rootfully (`sudo podman compose up`, outside the
 * plugin) must be discovered, shown as running, and have real service/container details —
 * not just a stack-level status with no data underneath.
 *
 * Requires real Cockpit Administrative access (not just Podman's own passwordless sudo),
 * which the shared `pluginPage` fixture doesn't provide — it navigates straight to the
 * plugin's iframe and never sees the outer shell's "Limited access" control. This spec
 * uses `loginWithAdminAccess` instead. Runs only against `fedora-podman-rootful`, the one
 * VM scenario with no rootless Podman socket at all, so discovery is forced through the
 * escalated (rootful) path being tested.
 */
test.describe('rootful Podman (no rootless socket)', () => {
  test('discovers a rootfully-started stack, shows it running, and loads real container info', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'fedora-podman-rootful',
      'only meaningful on the rootful-only VM — every other project has a rootless socket that would mask this',
    );

    await loginWithAdminAccess(page);
    await dismissStartupPodmanPrompt(page);

    // "gotify" was started outside the plugin via `sudo podman compose up -d` — if
    // discovery isn't escalating correctly, it silently never appears here at all
    // (issue #242's exact symptom).
    const row = stackRow(page, 'gotify');
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toHaveAttribute('data-status', /running|partial/);

    // The stack-level status above being correct isn't sufficient on its own — a separate
    // code path (src/api/containers.ts) powers the Info modal's container list, and had no
    // escalation at all, so it silently showed nothing even when the stack card was right.
    await row.getByRole('button', { name: 'Stack info' }).click();
    const modal = page.getByRole('dialog', { name: /gotify/i });
    await expect(modal).toBeVisible();
    await expect(modal.locator('.sim-no-containers')).not.toBeVisible();
    await expect(modal.getByText(/running/i).first()).toBeVisible();
    await modal.getByRole('button', { name: 'Close' }).click();
  });

  // docs/wiki/Troubleshooting.md: before #242's fix, the stack-level status
  // badge and Stack Info's own container list came from two separate
  // escalation-unaware code paths and could disagree — the row would say
  // "stopped" while Info still listed stale "running" containers (or vice
  // versa), because only one of the two paths had been fixed to escalate.
  // This asserts both genuinely agree *at the same moment*, right after a
  // real state transition — not just that each is eventually correct on
  // its own schedule.
  test('stack-level status and Stack Info agree on state at the same moment after a rootful transition', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'fedora-podman-rootful',
      'only meaningful on the rootful-only VM — every other project has a rootless socket that would mask this',
    );
    test.setTimeout(60_000);

    await loginWithAdminAccess(page);
    await dismissStartupPodmanPrompt(page);

    const row = stackRow(page, 'gotify');
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });

    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirm stop' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });

    // Real effect: opening Info immediately after must show the container as
    // genuinely exited too — not a stale "running" snapshot from before Stop.
    await row.getByRole('button', { name: 'Stack info' }).click();
    const modal = page.getByRole('dialog', { name: /gotify/i });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/running/i)).toHaveCount(0);
    await expect(modal.getByText(/exited/i).first()).toBeVisible({ timeout: 10000 });
    await modal.getByRole('button', { name: 'Close' }).click();

    // Restore for any subsequent run of the spec above.
    await row.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  });
});

// Regression coverage for docs/testing.md §7.1: Docker rootless mode.
// `fedora-full` is the one VM with a genuine per-user Docker socket
// (`/run/user/<uid>/docker.sock` — see scripts/test-vm.config.sh's
// dockerd-rootless-setuptool.sh setup); every other project either has no
// rootless Docker at all or defaults to Podman.
test.describe('Docker rootless (fedora-full)', () => {
  test('Docker mode shows the Rootless badge, and a full Up/Down lifecycle actually works', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'fedora-full', 'needs a VM with a genuine rootless Docker socket — only fedora-full has one configured');
    // Rootless Docker's per-container network setup (rootlesskit/slirp4netns)
    // adds real, variable startup latency beyond rootful — observed this
    // occasionally outlasting a 20s post-Up status wait even though the
    // progress modal itself already reported success. Generous budget here
    // rather than a tight one, consistent with how this suite treats other
    // real (not test-bug) timing variance.
    test.setTimeout(90_000);

    // This file's `page` fixture (plain @playwright/test, not the plugin
    // base's `pluginPage`) starts unnavigated — loginWithAdminAccess gets us
    // to the plugin the same way the other two tests in this file do; the
    // admin escalation itself isn't needed here, just the navigation.
    await loginWithAdminAccess(page);
    await baseData(page);
    await expect(page.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cc-footer').getByText('Rootless', { exact: true })).toBeVisible({ timeout: 10000 });

    // ensureDown covers every starting state (running, stopped, or not yet
    // discovered) uniformly. Not using the shared upStack() helper here: its
    // built-in 20s post-Up status wait occasionally isn't enough for
    // rootless Docker's real, variable per-container network setup latency
    // (rootlesskit/slirp4netns) — give it the wider budget this test.setTimeout
    // above already allows for instead.
    await ensureDown(page, 'gotify');
    await downedCard(page, 'gotify').getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('dialog', { name: /Confirm up.*gotify/ }).getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('dialog', { name: /^Up.*gotify/ }).getByRole('button', { name: 'Close' }).click({ timeout: 30000 });
    await expect(stackRow(page, 'gotify')).toHaveAttribute('data-status', /running|partial/, { timeout: 60000 });

    await downStack(page, 'gotify');
  });
});
