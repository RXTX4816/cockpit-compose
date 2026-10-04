import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, COMPOSE_DIR } from './helpers/base';
import { stackRow, upStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// #345: stacks Docker cannot fully take down used to stay in the running list with no
// way out, Down appearing to do nothing. The stack is staged here and removed again
// over SSH, leaving the VM baselines untouched.
const GONE = 'gone-test';

const oneService = `services:
  keep:
    image: busybox
    command: ["sleep", "3600"]
`;

const stage = (vm: string, name: string, yaml: string) =>
  sshExec(vm, `mkdir -p ${COMPOSE_DIR}/${name} && cat > ${COMPOSE_DIR}/${name}/docker-compose.yml <<'EOF'\n${yaml}EOF`);
const containersOf = async (vm: string, name: string) =>
  (await sshExec(vm, `${engineCli(vm)} ps -aq --filter label=com.docker.compose.project=${name}`)).split('\n').filter(Boolean);

test.afterEach(async ({}, testInfo) => {
  const vm = testInfo.project.name;
  for (const name of [GONE]) {
    await sshExec(vm, `ids=$(${engineCli(vm)} ps -aq --filter label=com.docker.compose.project=${name}); [ -n "$ids" ] && ${engineCli(vm)} rm -f $ids >/dev/null 2>&1; rm -rf ${COMPOSE_DIR}/${name}; true`).catch(() => {});
  }
});

test('Down on a stack whose folder was deleted reports the leftovers, and Force remove clears them', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(120_000);
  const vm = testInfo.project.name;
  await stage(vm, GONE, oneService);
  await baseData(page);
  await upStack(page, GONE);

  // The folder disappears while the container runs; compose has no file to work from.
  await sshExec(vm, `rm -rf ${COMPOSE_DIR}/${GONE}`);
  await stackRow(page, GONE).getByRole('button', { name: 'Down (remove containers)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm down' });
  await dialog.getByRole('button', { name: 'Down (remove)' }).click();

  // It must not look like nothing happened: the leftovers are named, with a way out.
  await expect(dialog.getByText(`Docker still lists containers for ${GONE}`)).toBeVisible({ timeout: 30000 });
  expect(await containersOf(vm, GONE)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Force remove' }).click();

  await expect(dialog).toHaveCount(0, { timeout: 30000 });
  await expect.poll(() => containersOf(vm, GONE), { timeout: 20000 }).toHaveLength(0);
  await expect(stackRow(page, GONE)).toHaveCount(0, { timeout: 20000 });
});
