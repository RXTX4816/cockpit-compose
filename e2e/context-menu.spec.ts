import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { ensureDown, stackRow, upStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// #334: right-clicking a running stack opens that layout's own ⋮ menu at the cursor.
// Each layout's menu differs, but all four offer Pause/Unpause, which has a real,
// checkable effect and no confirmation dialog. Uses `multi`, whose worker loops forever,
// so "paused" can only come from the action (see stack-lifecycle.spec.ts).
const LAYOUTS = ['Power User', 'Pretty', 'Unix', 'Minimal'] as const;

test.afterEach(async ({ pluginPage: page }, testInfo) => {
  const vm = testInfo.project.name;
  // A stack left paused can make Down misbehave on some engines.
  await sshExec(vm, `${engineCli(vm)} unpause $(${engineCli(vm)} ps -q --filter label=com.docker.compose.project=multi --filter status=paused) 2>/dev/null`).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  // Torn down over SSH: the shared downStack() helper drives the default layout's Down
  // button, which the Unix layout names "[down]", so it would hang there.
  await sshExec(vm, `cd /home/test/testcompose/multi && ${engineCli(vm)} compose -p multi down >/dev/null 2>&1`).catch(() => {});
});

for (const layout of LAYOUTS) {
  test(`${layout} layout: right-click opens the stack's menu, and its Pause/Unpause really act`, async ({ pluginPage: page }, testInfo) => {
    test.setTimeout(120_000);
    const vm = testInfo.project.name;
    const states = () =>
      sshExec(vm, `${engineCli(vm)} ps -a --filter label=com.docker.compose.project=multi --format "{{.State}}"`)
        .then(out => out.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean));

    await baseData(page);
    await ensureDown(page, 'multi');
    await upStack(page, 'multi');
    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('button', { name: layout, exact: true }).click();

    const row = stackRow(page, 'multi');
    // A neutral spot near the entry's top-left corner, clear of its buttons' tooltips.
    const rightClick = () => row.click({ button: 'right', position: { x: 6, y: 6 } });
    // Right-clicks until `item` shows up. Right after an action the entry is still busy
    // for a moment, and like its disabled ⋮ button the context menu stays shut then.
    // A menu that never opens, or keeps showing the wrong item, still fails.
    const openMenuShowing = (item: string) => expect(async () => {
      await rightClick();
      await expect(page.getByRole('menuitem', { name: item, exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20000 });

    await openMenuShowing('Pause');
    // It opens where the cursor is (it once landed in the page's top-left corner).
    const rowBox = (await row.boundingBox())!;
    const pauseItem = page.getByRole('menuitem', { name: 'Pause', exact: true });
    const menuBox = (await page.locator('div.pf-v6-c-menu').filter({ has: pauseItem }).boundingBox())!;
    expect(Math.abs(menuBox.x - (rowBox.x + 6))).toBeLessThan(40);
    expect(Math.abs(menuBox.y - (rowBox.y + 6))).toBeLessThan(40);
    await page.getByRole('menuitem', { name: 'Pause', exact: true }).click();
    await expect.poll(async () => (await states()).every(s => s === 'paused'), { timeout: 20000 }).toBe(true);
    await expect(row).toHaveAttribute('data-status', 'paused', { timeout: 20000 });

    // The same right-click now offers the reverse action.
    await openMenuShowing('Unpause');
    await expect(page.getByRole('menuitem', { name: 'Pause', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Unpause', exact: true }).click();
    await expect.poll(async () => (await states()).every(s => s === 'running'), { timeout: 20000 }).toBe(true);
    await expect(row).toHaveAttribute('data-status', 'running', { timeout: 20000 });

    // Escape closes the menu without acting.
    await openMenuShowing('Pause');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Pause', exact: true })).toHaveCount(0);
  });
}
