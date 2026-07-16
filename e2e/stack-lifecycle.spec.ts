import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, ensureDown, stackRow, upStack } from './helpers/stacks';

// Uses gotify (always pre-staged, always down at VM boot). afterEach forces
// it back down even if an assertion above throws mid-test — otherwise a
// failed run here leaves gotify running and breaks every other spec's
// baseData() setup on a re-run against the same VM.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Up starts a downed stack, Down removes it again — real status transitions, not just UI toasts', async ({ pluginPage: page }) => {
  // See e2e/logs.spec.ts for why: Up alone can eat most of the default 30s under VM load.
  test.setTimeout(60_000);
  await baseData(page);

  // Self-heal against a previous run's leaked state before assuming gotify starts down.
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');
  await expect(stackRow(page, 'gotify')).toHaveAttribute('data-status', /running|partial/);

  await downStack(page, 'gotify');
  await expect(stackRow(page, 'gotify')).toHaveCount(0);
});
