import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, COMPOSE_DIR } from './helpers/base';
import { closeUpProgress, downStack, downedCard, stackRow } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// Compose 5.6.0 warns about spec-valid attributes that have no effect outside Swarm, and
// the Up dialog lifts such warnings into a box above the log (#326). Older Compose stays
// silent about deploy.update_config, so this needs >= 5.6.0 (arch-* at the time of
// writing). The stack is staged here, leaving the VM baselines untouched.
const STACK = 'warn-test';
const STACK_DIR = `${COMPOSE_DIR}/${STACK}`;

const COMPOSE = `services:
  web:
    image: busybox
    command: ["sleep", "3600"]
    deploy:
      update_config:
        parallelism: 2
`;

async function composeAtLeast56(vm: string): Promise<boolean> {
  if (engineCli(vm) !== 'docker') return false;
  const version = (await sshExec(vm, 'docker compose version --short 2>/dev/null || true')).trim().replace(/^v/, '');
  const [major, minor] = version.split('.').map(Number);
  return major > 5 || (major === 5 && minor >= 6);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(!(await composeAtLeast56(testInfo.project.name)), 'needs Docker Compose >= 5.6.0');
  await sshExec(testInfo.project.name,
    `mkdir -p ${STACK_DIR} && cat > ${STACK_DIR}/docker-compose.yml <<'EOF'\n${COMPOSE}EOF`);
});

test.afterEach(async ({ pluginPage: page }, testInfo) => {
  if (testInfo.status === 'skipped') return;
  await page.keyboard.press('Escape').catch(() => {});
  if (await stackRow(page, STACK).count()) {
    await downStack(page, STACK).catch(() => {});
  }
  await sshExec(testInfo.project.name,
    `cd ${STACK_DIR} 2>/dev/null && docker compose -p ${STACK} down --remove-orphans >/dev/null 2>&1; rm -rf ${STACK_DIR}`);
});

test('Up lifts a Compose warning out of the log into a readable box', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);

  await downedCard(page, STACK).getByRole('button', { name: 'Up', exact: true }).click();
  await page.getByRole('dialog', { name: new RegExp(`Confirm up.*${STACK}`) }).getByRole('button', { name: 'Up', exact: true }).click();
  const progress = page.getByRole('dialog', { name: new RegExp(`^Up.*${STACK}`) });

  // The message itself, without Compose's time=/level= prefixes or escaped quotes.
  await expect(progress.getByText('Docker Compose reported warnings')).toBeVisible({ timeout: 60000 });
  await expect(progress.locator('li', { hasText: 'service "web": deploy.update_config' })).toBeVisible();
  // A warning is not a failure: the stack still comes up.
  await closeUpProgress(progress, 90000);
  await expect(stackRow(page, STACK)).toHaveAttribute('data-status', /running/, { timeout: 30000 });
});
