import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// `gotify` publishes `8080:80` with no bind address, which Docker/Podman report
// bound to 0.0.0.0 — classified as an "external" port (src/api/parsing.ts
// getBindType) and rendered as a clickable badge with a globe icon/tooltip.
//
// NOTE: docs/wiki/Stacks-Dashboard.md describes port clicks as going through an
// "external-link confirmation" first — but StatsCell.tsx/PrettyCard.tsx/
// UnixRow.tsx all call `window.open(url, "_blank", ...)` directly with no
// ExternalLinkModal in between (that modal is only wired up in
// ContainerTable.tsx's per-service changelog link — see
// stack-info-external-link.spec.ts). This spec asserts the real, current
// behavior (direct navigation), not the documented-but-not-implemented one;
// worth a doc fix or a product decision, not something to paper over here.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('An external-bound port badge is clickable and calls window.open with the real host:port URL', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    const portBadge = row.locator('.sc-port-pill[data-bind-type="external"]', { hasText: '8080' });
    await expect(portBadge).toBeVisible({ timeout: 15000 });

    // Capture the actual window.open() call rather than letting it navigate
    // a real popup — the container port isn't necessarily reachable from
    // inside the guest VM's own browser (that's a networking question, not
    // what this spec is about), and a failed navigation can land on
    // about:blank or a chrome-error page before Playwright ever observes the
    // originally requested URL.
    await page.evaluate(() => {
      (window as unknown as { __openCalls: string[] }).__openCalls = [];
      window.open = (url?: string | URL) => {
        (window as unknown as { __openCalls: string[] }).__openCalls.push(String(url));
        return null;
      };
    });
    await portBadge.click();
    const calls = await page.evaluate(() => (window as unknown as { __openCalls: string[] }).__openCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(':8080');
  });
});
