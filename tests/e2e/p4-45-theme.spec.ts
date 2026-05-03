// P4-45 テーマ切替 (U9) の E2E 検証。
// 仕様: [現状.md §6 U9]、[src/ui/ThemeToggle.tsx]、[src/index.css]。

import { expect, test } from '@playwright/test';

test.describe('P4-45: テーマ切替 (U9)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // ボタンが render されるまで待つ（pipeline 計算は不要）
    await expect(page.getByTestId('app-theme-toggle')).toBeVisible();
  });

  test('既定は dark テーマ（<html data-theme=dark>）', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('トグルを押すと light に切替わり、再度押すと dark に戻る', async ({ page }) => {
    await page.getByTestId('app-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('app-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('light に切替えると body の background-color が変わる', async ({ page }) => {
    const darkBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    await page.getByTestId('app-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // 0.15s transition の完了を待つ
    await page.waitForTimeout(250);
    const lightBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(lightBg).not.toBe(darkBg);
  });

  test('テーマ選択は localStorage に永続化され、リロード後も維持される', async ({
    page,
  }) => {
    await page.getByTestId('app-theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const flag = await page.evaluate(() => window.localStorage.getItem('exoclim-theme'));
    expect(flag).toBe('light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
