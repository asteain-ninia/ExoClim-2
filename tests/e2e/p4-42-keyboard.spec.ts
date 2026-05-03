// P4-42 キーボードショートカット (U7) の E2E 検証。
// 仕様: [現状.md §6 U7]、[src/ui/KeyboardShortcuts.tsx]。

import { expect, test } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

test.describe('P4-42: キーボードショートカット (U7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
        if (!c) return false;
        const ctx = c.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < data.length; i += 4 * 64) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          if (r > 70 && r > g + 25) return true;
        }
        return false;
      },
      { timeout: 10_000 },
    );
    await page.waitForTimeout(900);
    await openAllCollapsibleSections(page);
  });

  test('数字キー 1 を押すと SeasonSelector が「1月」アクティブになる', async ({ page }) => {
    await page.keyboard.press('1');
    await expect(page.getByTestId('season-0')).toHaveAttribute('aria-checked', 'true');
  });

  test('数字キー 3 を押すと「7月」アクティブになる', async ({ page }) => {
    await page.keyboard.press('3');
    await expect(page.getByTestId('season-6')).toHaveAttribute('aria-checked', 'true');
  });

  test('数字キー 0 を押すと「年平均」アクティブになる（リセット）', async ({ page }) => {
    await page.keyboard.press('2'); // 4月
    await page.keyboard.press('0'); // 年平均に戻す
    await expect(page.getByTestId('season-annual')).toHaveAttribute('aria-checked', 'true');
  });

  test('スライダーにフォーカス中はキー入力が無視される', async ({ page }) => {
    await page.getByTestId('slider-body-axial-tilt').focus();
    await page.keyboard.press('1');
    // season-annual のままであることを確認
    await expect(page.getByTestId('season-annual')).toHaveAttribute('aria-checked', 'true');
  });
});
