// P4-8 Step 4 気流の E2E 検証。
// 仕様: [docs/spec/04_気流.md §4 / §5]。

import { expect, test, type Page } from '@playwright/test';

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

async function canvasFingerprint(page: Page): Promise<number> {
  return await page.locator('[data-testid="map-canvas"]').evaluate((canvas) => {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    if (!ctx) return 0;
    const w = (canvas as HTMLCanvasElement).width;
    const h = (canvas as HTMLCanvasElement).height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4 * 16) {
      sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
    }
    return sum;
  });
}

test.describe('P4-8: Step 4 気流', () => {
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
    await page.waitForTimeout(200);
  });

  test('Step 4 気流パネル（2 スライダー）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-airflow')).toBeVisible();
    await expect(page.getByTestId('slider-airflow-pressure-gradient')).toBeVisible();
    await expect(page.getByTestId('slider-airflow-mountain-threshold')).toBeVisible();
  });

  test('凡例に「最終地表風」「圧力 anomaly」トグルが表示される', async ({ page }) => {
    await expect(page.getByTestId('legend-final-wind')).toBeVisible();
    await expect(page.getByTestId('legend-final-wind')).toBeChecked();
    await expect(page.getByTestId('legend-pressure-anomaly')).toBeVisible();
    // 圧力 anomaly は既定 OFF
    await expect(page.getByTestId('legend-pressure-anomaly')).not.toBeChecked();
  });

  test('圧力 anomaly トグルを ON にすると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-pressure-anomaly').check();
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('圧力勾配風 強度を 0 に下げると Canvas 描画が変わる（最終風 = 卓越風）', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-airflow-pressure-gradient', '0');
    await page.waitForTimeout(500);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 4 気流既定値が表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-airflow-pressure-gradient')).toHaveValue('1');
    await expect(page.getByTestId('slider-airflow-mountain-threshold')).toHaveValue('2000');
  });
});
