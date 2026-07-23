import type { Page } from '@playwright/test';

/**
 * Logs in and switches Cockpit to Administrative access, then navigates to the plugin.
 *
 * Unlike the shared `pluginPage` fixture (which navigates straight to the plugin's own
 * iframe URL and never sees the outer Cockpit shell), this stays on the shell page first
 * so it can click "Limited access" in the top bar — in these test VMs (passwordless sudo)
 * that grants admin access instantly, with no password prompt. Use this instead of
 * `pluginPage` for specs that need real superuser escalation (e.g. rootful Podman/Docker
 * regression tests) — most specs don't need this and should keep using `pluginPage`.
 */
export async function loginWithAdminAccess(page: Page, pluginName = 'cockpit-compose'): Promise<void> {
  const user = process.env.VM_USER ?? 'test';
  const password = process.env.VM_PASSWORD ?? 'test';

  await page.goto('/');
  await page.locator('#login-user-input').fill(user);
  await page.locator('#login-password-input').fill(password);
  await page.locator('#login-button').click();
  await page.locator('#login-user-input').waitFor({ state: 'hidden' });

  await page.getByText('Limited access', { exact: true }).click();
  await page.getByText('You now have administrative access.').waitFor();
  // Two "Close" buttons exist (the modal's icon-only X, and the footer's text button) —
  // target the footer one specifically, since the X only has an aria-label, not visible text.
  await page.getByRole('button', { name: 'Close', exact: true }).filter({ hasText: 'Close' }).click();

  await page.goto(`/cockpit/@localhost/${pluginName}/index.html`);
}
