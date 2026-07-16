import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export type Runtime = 'docker' | 'podman';

/** Switches the active container runtime via the footer toggle, confirming Podman's warning modal if needed. */
export async function switchRuntime(page: Page, runtime: Runtime) {
  await page.getByRole('button', { name: new RegExp(runtime === 'docker' ? 'Docker' : 'Podman', 'i') }).click();
  if (runtime === 'podman') {
    const modal = page.getByRole('dialog', { name: 'Switch to Podman' });
    if (await modal.isVisible().catch(() => false)) {
      await modal.getByRole('button', { name: 'Continue' }).click();
    }
  }
}

/** Asserts the footer's rootless badge is (or isn't) shown, reflecting real socket detection. */
export async function expectRootless(page: Page, rootless: boolean) {
  const badge = page.getByText('Rootless', { exact: true });
  if (rootless) {
    await expect(badge).toBeVisible();
  } else {
    await expect(badge).not.toBeVisible();
  }
}
