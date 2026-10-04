import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, COMPOSE_DIR } from './helpers/base';
import { closeUpProgress, downStack, downedCard, stackRow, withRunningStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// Jobs (#326) need Docker Compose >= 5.6.0, which only some VMs ship (arch-* at the time
// of writing; fedora's packages lag behind). The stack is staged by this spec rather
// than provisioned, so the VM baselines every other spec relies on stay untouched.
const STACK = 'jobs-test';
const STACK_DIR = `${COMPOSE_DIR}/${STACK}`;
const JOB_MARKER = 'e2e-job-own-command-13579';

const COMPOSE = `services:
  web:
    image: busybox
    command: ["sleep", "3600"]
jobs:
  migrate:
    image: busybox
    command: ["echo", "${JOB_MARKER}"]
    triggers:
      manual: true
  nightly:
    image: busybox
    command: ["echo", "nightly"]
    profiles: [ops]
    triggers:
      schedule: ["0 3 * * *"]
`;

async function supportsJobs(vm: string): Promise<boolean> {
  if (engineCli(vm) !== 'docker') return false;
  const version = (await sshExec(vm, 'docker compose version --short 2>/dev/null || true')).trim().replace(/^v/, '');
  const [major, minor] = version.split('.').map(Number);
  return major > 5 || (major === 5 && minor >= 6);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(!(await supportsJobs(testInfo.project.name)), 'needs Docker Compose >= 5.6.0 for jobs');
  await sshExec(testInfo.project.name,
    `mkdir -p ${STACK_DIR} && cat > ${STACK_DIR}/docker-compose.yml <<'EOF'\n${COMPOSE}EOF`);
});

test.afterEach(async ({ pluginPage: page }, testInfo) => {
  if (testInfo.status === 'skipped') return;
  // A dialog left open by a failed step covers the stack row, and Down through the UI
  // would then hang until the test budget runs out. Close it, try the UI, and always
  // finish with the CLI so a stuck run can't leave the stack behind for the next test.
  await page.keyboard.press('Escape').catch(() => {});
  const cancel = page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true });
  if (await cancel.count()) await cancel.first().click().catch(() => {});
  if (await stackRow(page, STACK).count()) {
    await downStack(page, STACK).catch(() => {});
  }
  await sshExec(testInfo.project.name,
    `cd ${STACK_DIR} 2>/dev/null && docker compose -p ${STACK} down --remove-orphans >/dev/null 2>&1; rm -rf ${STACK_DIR}`);
});

test('Run triggers a job with an empty command, which runs the job\'s own command', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);

  await withRunningStack(page, STACK, async () => {
    await stackRow(page, STACK).getByRole('button', { name: `More actions for ${STACK}` }).click();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
    const modal = page.getByRole('dialog', { name: new RegExp(`Run — ${STACK}`) });
    await expect(modal).toBeVisible();

    // Jobs get their own <optgroup> in the service picker. Located directly: Chromium does
    // not expose an optgroup inside a native <select> as an accessible "group".
    await expect(modal.locator('#rm-service optgroup[label="Jobs"] option[value="migrate"]')).toBeAttached();
    await modal.locator('#rm-service').selectOption('migrate');
    await expect(modal.locator('#rm-command')).toHaveValue('');
    await modal.getByRole('button', { name: 'Run', exact: true }).click();

    // Real effect: the marker comes from the job's own declared command, which only runs
    // if `compose run migrate` executed the job rather than an empty override.
    await expect(modal.getByText(JOB_MARKER)).toBeVisible({ timeout: 60000 });
    await expect(modal.getByText('Command complete', { exact: false })).toBeVisible({ timeout: 30000 });
    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});

test('Up warns about an active scheduled job only while its profile is selected, and never starts jobs', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(120_000);
  const vm = testInfo.project.name;
  await baseData(page);

  await downedCard(page, STACK).getByRole('button', { name: 'Up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: new RegExp(`Confirm up.*${STACK}`) });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('Up does not start jobs', { exact: false })).toBeVisible();

  // nightly is behind the "ops" profile: inactive, so no warning yet.
  const warning = confirm.getByText('will refuse to start this stack', { exact: false });
  await expect(warning).toHaveCount(0);
  await confirm.getByRole('checkbox', { name: 'ops' }).check();
  await expect(warning).toBeVisible();
  await confirm.getByRole('checkbox', { name: 'ops' }).uncheck();
  await expect(warning).toHaveCount(0);

  await confirm.getByRole('button', { name: 'Up', exact: true }).click();
  await closeUpProgress(page.getByRole('dialog', { name: new RegExp(`^Up.*${STACK}`) }), 90000);

  // Real effect: the service runs, and Up created no container for either job.
  await expect(stackRow(page, STACK)).toHaveAttribute('data-status', /running/, { timeout: 30000 });
  const jobContainers = await sshExec(vm,
    `docker ps -aq --filter label=com.docker.compose.project=${STACK} --filter label=com.docker.compose.service=migrate; ` +
    `docker ps -aq --filter label=com.docker.compose.project=${STACK} --filter label=com.docker.compose.service=nightly`);
  expect(jobContainers.trim()).toBe('');
});
