import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { loginWithAdminAccess } from './helpers/admin';
import { baseData } from './helpers/base';
import { closeUpProgress, ensureDown, stackRow, downStack } from './helpers/stacks';
import { sshExec } from './helpers/vm';

const SUPERUSER_DIR = '/home/test/testcompose/superuser-test';

/**
 * Regression coverage for `composeFileSuperuser()` (src/api/cockpit.ts:334-344):
 * a compose file/directory owned by another uid (root, here — world-readable,
 * matching how a stack originally deployed by a root cron job or system
 * service would realistically look) needs superuser escalation to actually
 * bring up under rootless Docker, even though the socket itself needs none.
 *
 * Only meaningful where Docker's rootless (per-user) socket is genuinely
 * configured — `fedora-full` is the one VM with a real
 * `/run/user/<uid>/docker.sock`; every other project either has no rootless
 * Docker socket at all or defaults to Podman, whose escalation is governed
 * purely by socket mode (see stackSuperuser's comment), not file ownership.
 *
 * A tighter fixture (compose file genuinely unreadable to non-root) was tried
 * first but broke stack *discovery* itself: the scan's readComposeFile()
 * (`cat path`, src/api/files.ts:13-15) never requests escalation at all, so a
 * truly-unreadable file makes the stack invisible before Up is ever reachable
 * — a real asymmetry (escalation is wired up for write actions but not the
 * scan's own read), worth a follow-up, not something a single e2e case can
 * exercise meaningfully without becoming a test of "this stack never appears."
 *
 * Fixture: `testcompose/superuser-test` (docker-compose.yml, nginx:alpine on
 * :8102), created root-owned over SSH by the test itself — not part of the shared
 * cloud-init provisioning since it's specific to this one regression. It used to be
 * assumed to already exist, which only held on a VM where it had once been created
 * by hand; a freshly provisioned VM has no such directory. (It also used to sit on
 * :8099, which stable-tag_prunetest already publishes.)
 */
test('Compose file owned by root: Administrative access lets Up escalate and actually start it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fedora-full', 'needs a VM with a genuine rootless Docker socket — only fedora-full has one configured');
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  await sshExec(vm,
    `sudo rm -rf ${SUPERUSER_DIR} && sudo mkdir -p ${SUPERUSER_DIR} && `
    + `printf 'services:\\n  web:\\n    image: nginx:alpine\\n    ports:\\n      - "8102:80"\\n' | sudo tee ${SUPERUSER_DIR}/docker-compose.yml >/dev/null && `
    + `sudo chown -R root:root ${SUPERUSER_DIR}`);

  try {
    await loginWithAdminAccess(page);
    await baseData(page);
    await ensureDown(page, 'superuser-test');

    const downed = page.locator('[data-status="down"]').filter({ has: page.locator('#dss-name-superuser-test') });
    await expect(downed).toBeVisible({ timeout: 10000 });
    await downed.getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('dialog', { name: /Confirm up.*superuser-test/ }).getByRole('button', { name: 'Up', exact: true }).click();
    const progress = page.getByRole('dialog', { name: /^Up.*superuser-test/ });
    await closeUpProgress(progress);

    // Real effect: the container actually started under the escalated command
    // against the root-owned compose directory — not just a UI success message
    // papering over a silent failure.
    await expect(stackRow(page, 'superuser-test')).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
    await downStack(page, 'superuser-test');
  } finally {
    await sshExec(vm, `sudo rm -rf ${SUPERUSER_DIR}`).catch(() => {});
  }
});
