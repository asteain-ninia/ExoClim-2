// P4-32 Footer (アプリメタ情報) の E2E 検証。
// 仕様: [現状.md §6 U16]、[src/ui/Footer.tsx]。

import { expect, test } from '@playwright/test';

test.describe('P4-32: Footer (U16 アプリメタ情報)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Footer が表示される', async ({ page }) => {
    await expect(page.getByTestId('app-footer')).toBeVisible();
  });

  test('バージョン表記 (v0.0.0 or v数字...) が含まれる', async ({ page }) => {
    const footer = page.getByTestId('app-footer');
    await expect(footer).toContainText(/v\d+\.\d+\.\d+/);
  });

  test('build 日付 (YYYY-MM-DD) が含まれる', async ({ page }) => {
    const footer = page.getByTestId('app-footer');
    await expect(footer).toContainText(/build/);
    await expect(footer).toContainText(/\d{4}-\d{2}-\d{2}/);
  });

  test('Worldbuilding Pasta リンクが target=_blank で含まれる', async ({ page }) => {
    const link = page.getByTestId('app-footer').locator('a', { hasText: 'Worldbuilding Pasta' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noreferrer|noopener/);
  });
});
