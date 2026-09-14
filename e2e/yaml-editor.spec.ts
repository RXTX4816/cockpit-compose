import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, ensureDown, openYamlEditor, stackRow, upStack, yamlEditorContent } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

test.describe('basic editor behavior (gotify, pre-opened in edit mode)', () => {
  test.beforeEach(async ({ pluginPage: page }) => {
    await baseData(page);
    await openYamlEditor(page, 'gotify');
    // The modal opens in read-only mode; click Edit to enable editing and show Save/Cancel
    await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
  });

  test('YAML editor modal opens', async ({ pluginPage: page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('editor contains YAML content', async ({ pluginPage: page }) => {
    const modal = page.getByRole('dialog');
    await expect(modal.locator('.cm-editor')).toBeVisible();
    await expect(yamlEditorContent(page)).toContainText('gotify');
  });

  test('Save button is present', async ({ pluginPage: page }) => {
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('Cancel exits edit mode without closing the modal', async ({ pluginPage: page }) => {
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Modal stays open but returns to read-only — Save button is gone
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
  });

  test('closing the modal returns to the main view', async ({ pluginPage: page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
  });
});

// `multi-file` has two real compose files (docker-compose.yml + overrides.yml —
// see scripts/test-vm.config.sh).
// NOTE: an "Add file" sub-case (creating a 3rd file via the tab bar's Add
// button, opened as a nested <Modal aria-label="Add compose file">) was
// attempted here but its "Create file" button proved unreliable to click in
// this session even with force:true and explicit dialog scoping — worth a
// dedicated follow-up investigation with browser devtools attached, since
// the button was visibly present and enabled (confirmed via screenshot).
// Deleting/adding via the tab bar isn't covered elsewhere either — tracked
// as a real backlog gap, not silently dropped.
test('Multi-file tabs show each file\'s own real content, not shared/stale content', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  const multiFileCard = page.locator('[data-status="down"]').filter({ has: page.locator('#dss-name-multi-file') });
  await expect(multiFileCard).toBeVisible({ timeout: 10000 });
  // Not using openYamlEditor() here: its force:true click proved flaky
  // specifically for this stack in this session (the click reported success
  // but no dialog opened, repeatably) — a plain click, which waits for real
  // actionability instead of skipping the check, was reliable instead.
  await multiFileCard.getByRole('button', { name: 'Edit compose file' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 10000 });

  const tabs = modal.locator('[role="tab"]');
  await expect(tabs).toHaveCount(2);
  await expect(modal.locator('.cm-content')).toContainText('app');

  await modal.getByRole('tab', { name: /overrides\.yml/ }).click();
  await expect(modal.locator('.cm-content')).toContainText('NGINX_HOST');

  await modal.getByRole('button', { name: 'Close' }).click();
});

// A previous attempt at this scenario (see the header comment above) found the
// "Create file" button unreliable to click: typing into the nested "Add compose
// file" modal's filename field left its own backdrop (and the outer YamlModal's)
// stuck at aria-hidden="true", so getByRole could no longer see anything inside
// it — issue #277. Root cause turned out to be PatternFly's Modal hiding every
// body child except its *own* backdrop on each re-render, so the outer modal
// hid the inner one; mitigated app-side by useKeepTopModalAccessible().
// The role-based queries below are back, and are what regression-test it.
test('Add file creates a real new compose file; Delete file removes it from disk', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  const EXTRA_PATH = '/home/test/testcompose/env-test/extra.yml';
  await sshExec(vm, `rm -f ${EXTRA_PATH}`).catch(() => {});

  await baseData(page);
  await openYamlEditor(page, 'env-test');
  const modal = page.getByRole('dialog');
  await expect(modal.locator('[role="tab"]')).toHaveCount(1);

  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  const addModal = page.getByRole('dialog').filter({ hasText: 'Add compose file' });
  await expect(addModal).toBeVisible({ timeout: 10000 });
  await addModal.locator('#ym-new-filename').fill('extra.yml');

  // Deliberately role-based: this is the #277 regression test. Before the fix the
  // fill above made this dialog unreachable through the accessibility tree.
  await addModal.getByRole('button', { name: 'Create file', exact: true }).click();
  await expect(addModal).toHaveCount(0, { timeout: 15000 });

  // Real effect: a second tab for the real new file exists, and it's the
  // one now active/showing its (stub) content — not just a UI state flag.
  await expect(modal.locator('[role="tab"]')).toHaveCount(2, { timeout: 10000 });
  await expect(modal.getByRole('tab', { name: /extra\.yml/ })).toBeVisible();

  // Real effect: the file genuinely exists on disk, independent of the app.
  const lsOut = await sshExec(vm, `test -f ${EXTRA_PATH} && echo EXISTS`);
  expect(lsOut.trim()).toBe('EXISTS');

  // --- Delete it again ---
  await modal.getByRole('tab', { name: /extra\.yml/ }).click(); // ensure its tab is active
  const deleteBtn = modal.locator('.ym-delete-file-btn');
  await deleteBtn.click();
  const deleteConfirm = page.getByRole('dialog').filter({ hasText: 'Delete extra.yml?' });
  await expect(deleteConfirm).toBeVisible({ timeout: 10000 });
  await deleteConfirm.getByRole('button', { name: 'Delete file', exact: true }).click();
  await expect(deleteConfirm).not.toBeVisible({ timeout: 10000 });

  // Real effect: back to one tab, and the file is genuinely gone from disk.
  await expect(modal.locator('[role="tab"]')).toHaveCount(1, { timeout: 10000 });
  const lsAfter = await sshExec(vm, `test -f ${EXTRA_PATH} && echo EXISTS || echo GONE`);
  expect(lsAfter.trim()).toBe('GONE');

  await modal.getByRole('button', { name: 'Close' }).click();
});

// Regression coverage for docs/testing.md §6.14's malformed-save case: typing
// broken YAML and hitting Save must not silently write it to disk — it should
// route through the same "Save with issues?" confirm dialog Create Stack's
// validation-bypass flow uses, showing a real parser error count. Cancelling
// must leave the on-disk file untouched.
//
// Known flake, same class as adversarial.spec.ts's malformed-YAML case: passes
// reliably in isolation (verified repeatedly) but intermittently times out
// waiting for the confirm dialog when run after many prior gotify edits in
// the same long-lived VM/browser session — screenshots at failure always show
// the correct final state already rendered, consistent with cumulative
// session/host load slowing CodeMirror's linter rather than a real app bug.
test('Saving malformed YAML shows a real error count and Cancel leaves the file untouched', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await openYamlEditor(page, 'gotify');
  const modal = page.getByRole('dialog');
  const originalContent = await modal.locator('.cm-content').textContent();

  await modal.getByRole('button', { name: 'Edit' }).click();
  const editor = modal.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('services: [this is not valid yaml: : :');
  // CodeMirror's async YAML linter needs a moment to settle after typing —
  // clicking Save immediately raced it in this session (Save's own
  // synchronous validation is unaffected, but the resulting UI became
  // unresponsive for several seconds afterward, as if the linter's work
  // was still draining on the main thread).
  await page.waitForTimeout(5000);

  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  // Neither the Modal's aria-label ("Confirm save") nor its ModalHeader
  // title text alone resolved via role+name matching here — filter by
  // visible content instead of fighting the accessible-name computation.
  const confirm = page.getByRole('dialog').filter({ hasText: 'Save with issues?' });
  await expect(confirm).toBeVisible({ timeout: 10000 });
  await expect(confirm.getByText('Errors found')).toBeVisible({ timeout: 15000 });
  await expect(confirm.getByText('1 error in your compose file', { exact: false })).toBeVisible({ timeout: 15000 });

  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).not.toBeVisible({ timeout: 10000 });

  // Real effect: cancelling must not have written anything — exit edit mode
  // and confirm the in-memory content reverted to the untouched original.
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal.locator('.cm-content')).toHaveText(originalContent ?? '', { timeout: 10000 });
});

test('Snapshot history records a real edit, shows a diff, and Restore reverts the file on disk', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await openYamlEditor(page, 'gotify');
  const modal = page.getByRole('dialog');
  const originalContent = await modal.locator('.cm-content').textContent();

  await modal.getByRole('button', { name: 'Edit' }).click();
  const editor = modal.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n    # e2e-snapshot-marker');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10000 });

  // Real effect: a snapshot of the pre-edit content now exists.
  await expect(modal.getByRole('button', { name: /History \(\d+\)/ })).toBeVisible({ timeout: 10000 });
  await modal.getByRole('button', { name: /History \(\d+\)/ }).click();
  await expect(modal.getByText('Snapshots', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Changes' }).first().click();
  await expect(modal.locator('.pf-v6-c-code-editor, .ym-diff, .cm-editor').first()).toBeVisible();

  await modal.getByRole('button', { name: 'Restore' }).first().click();
  await expect(modal.locator('.cm-content')).not.toContainText('e2e-snapshot-marker', { timeout: 10000 });

  // Restore only updates the in-memory editor content — save it back to disk
  // so the fixture file is genuinely restored, not left dirty for other specs.
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10000 });
  const restoredContent = await modal.locator('.cm-content').textContent();
  expect(restoredContent).toBe(originalContent);
});

// Wave 5 (#227): "Import" an existing on-disk file into the stack, which is a
// different flow from "Add" (create-new, covered above). The multi-file fixture's
// second file is pre-staged by cloud-init rather than imported through the UI, so
// the Import button itself had never been clicked.
//
// The file is placed over SSH first so it exists on disk but is not yet one of the
// stack's ConfigFiles — exactly the state Import's directory scan looks for.
test('Import adds an existing on-disk file as a real tab, backed by that same file', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  const DIR = '/home/test/testcompose/env-test';
  const FILE = `${DIR}/e2e-import.yml`;
  await sshExec(vm, `printf 'services:\\n  imported:\\n    image: busybox\\n    # e2e-import-origin\\n' > ${FILE}`);

  try {
    await baseData(page);
    await openYamlEditor(page, 'env-test');
    const modal = page.getByRole('dialog').filter({ hasText: 'env-test — compose file' });
    await expect(modal.locator('[role="tab"]')).toHaveCount(1);

    await modal.getByRole('button', { name: 'Import', exact: true }).click();
    const importModal = page.getByRole('dialog').filter({ hasText: 'Import existing file' });
    await expect(importModal).toBeVisible({ timeout: 10000 });

    // The scan lists the untracked file by its full path, labelled by basename.
    const select = importModal.locator('#ym-import-file');
    await expect(select.locator(`option[value="${FILE}"]`)).toHaveCount(1, { timeout: 15000 });
    await select.selectOption(FILE);
    await importModal.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(importModal).toHaveCount(0, { timeout: 10000 });

    // Real effect #1: a second tab exists for it, showing the file's real content.
    await expect(modal.locator('[role="tab"]')).toHaveCount(2, { timeout: 10000 });
    const tab = modal.getByRole('tab', { name: /e2e-import\.yml/ });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(modal.locator('.cm-content')).toContainText('e2e-import-origin', { timeout: 10000 });

    // Real effect #2 — it is the same file, not an in-memory copy: an edit saved in
    // this tab lands at that exact path on disk.
    await modal.getByRole('button', { name: 'Edit' }).click();
    await modal.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n    # e2e-import-edited');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10000 });

    const onDisk = await sshExec(vm, `cat ${FILE}`);
    expect(onDisk).toContain('e2e-import-origin');
    expect(onDisk).toContain('e2e-import-edited');
  } finally {
    await sshExec(vm, `rm -f ${FILE} ${FILE}.snapshot.*`).catch(() => {});
  }
});

// Wave 5 (#227): selective recreation. After a compose file changes, Up should
// recreate only the services whose definition changed and leave the rest alone.
// Nothing asserted that before — backup-restore.spec.ts touches re-Up only
// incidentally.
//
// Deviation from the inventory's planned shape, deliberately: it suggested bumping
// one service's image tag. That makes the test depend on pulling a new image from
// a registry, which is slow and network-flaky. Adding an environment variable is an
// equally real change to the service definition — Compose recreates for it the same
// way — with no pull involved.
//
// The file is edited over SSH rather than keystroke-by-keystroke in CodeMirror,
// whose auto-indent makes precise YAML insertion brittle; the editor's own save path
// is already covered by the snapshot test above. What is under test here is what Up
// does with the change, and that part goes through the UI.
test('Up after editing one service recreates only that service\'s container', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(150_000);
  const vm = testInfo.project.name;
  const FILE = '/home/test/testcompose/multi/docker-compose.yml';
  const cli = engineCli(vm);
  const idOf = async (service: string) => (await sshExec(vm,
    `${cli} ps -q --no-trunc --filter label=com.docker.compose.project=multi --filter label=com.docker.compose.service=${service}`)).trim();

  await sshExec(vm, `cp ${FILE} ${FILE}.e2e-bak`);
  try {
    await baseData(page);
    await ensureDown(page, 'multi');
    await upStack(page, 'multi');

    const before = { web: await idOf('web'), cache: await idOf('cache'), worker: await idOf('worker') };
    for (const [svc, id] of Object.entries(before)) {
      expect(id, `${svc} should be running before the edit`).not.toBe('');
    }

    // Change `cache`'s definition only: add an environment block under it.
    await sshExec(vm,
      `sed -i 's#^    image: redis:alpine$#    image: redis:alpine\\n    environment:\\n      E2E_RECREATE_MARKER: "1"#' ${FILE}`);
    expect(await sshExec(vm, `cat ${FILE}`)).toContain('E2E_RECREATE_MARKER');

    // Up again, from the running row.
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'Up', exact: true }).click();
    await page.getByRole('dialog', { name: /Confirm up.*multi/ }).getByRole('button', { name: 'Up', exact: true }).click();
    const progress = page.getByRole('dialog', { name: /^Up.*multi/ });
    await progress.getByRole('button', { name: 'Close' }).click({ timeout: 60000 });
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 30000 });

    // Real effect: only the edited service has a new container.
    await expect.poll(() => idOf('cache'), { timeout: 30000 }).not.toBe(before.cache);
    expect(await idOf('cache')).not.toBe('');
    expect(await idOf('web'), 'web was not edited and must keep its container').toBe(before.web);
    expect(await idOf('worker'), 'worker was not edited and must keep its container').toBe(before.worker);

    // And the change genuinely reached the new container.
    const env = await sshExec(vm, `${cli} inspect --format '{{range .Config.Env}}{{println .}}{{end}}' ${await idOf('cache')}`);
    expect(env).toContain('E2E_RECREATE_MARKER=1');
  } finally {
    await sshExec(vm, `mv ${FILE}.e2e-bak ${FILE}`).catch(() => {});
    if (await stackRow(page, 'multi').count()) await downStack(page, 'multi').catch(() => {});
  }
});
