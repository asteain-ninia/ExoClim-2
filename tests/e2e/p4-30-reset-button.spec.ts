// P4-30 グローバル reset ボタンの E2E 検証。
// 仕様: [現状.md §6 U13]、[src/ui/ResetButton.tsx]。

import { expect, test, type Page } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

async function setRangeValue(page: Page, testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, v);
    } else {
      input.value = v;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test.describe('P4-30: グローバル reset ボタン (U13)', () => {
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

  test('reset ボタンが header に表示され「↺ 全リセット」ラベル', async ({ page }) => {
    const btn = page.getByTestId('app-reset-button');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/↺.*全リセット/);
  });

  test('1 回クリックで「本当にリセット？」確認状態に切替わる', async ({ page }) => {
    const btn = page.getByTestId('app-reset-button');
    await btn.click();
    await expect(btn).toHaveText(/本当に/);
  });

  test('連続 2 回クリックでパラメータが初期値（地球プリセット）に戻る', async ({ page }) => {
    // 軌道スライダー（地軸傾斜）を変更してから reset
    await setRangeValue(page, 'slider-body-axial-tilt', '45');
    await page.waitForTimeout(900);
    await expect(page.getByTestId('slider-body-axial-tilt')).toHaveValue('45');
    // reset ボタンを 2 回クリック
    const btn = page.getByTestId('app-reset-button');
    await btn.click();
    await btn.click();
    await page.waitForTimeout(900);
    // 地球プリセットの 23.5° に戻る
    await expect(page.getByTestId('slider-body-axial-tilt')).toHaveValue('23.5');
  });
});
