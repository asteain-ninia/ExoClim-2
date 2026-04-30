// P4-6 Step 2 風帯の E2E 検証。
// 仕様: [docs/spec/02_風帯.md §4 / §5] / [要件定義書.md §2.2.2]。

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

test.describe('P4-6: Step 2 風帯', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
      if (!c) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      const px = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return (px[0] ?? 0) > 0 || (px[1] ?? 0) > 0 || (px[2] ?? 0) > 0;
    });
    // Step 5 を pipeline に追加して初期計算が長くなったため十分な待機を取る。
    await page.waitForTimeout(900);
  });

  test('Step 2 風帯パネル（3 スライダー）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-wind-belt')).toBeVisible();
    await expect(page.getByTestId('slider-wind-subtropical-shift')).toBeVisible();
    await expect(page.getByTestId('slider-wind-continental-anomaly')).toBeVisible();
    await expect(page.getByTestId('slider-wind-mean-speed')).toBeVisible();
  });

  test('凡例に「卓越風」トグルが表示される（既定 OFF: P4-8 で Step 4 final wind を既定 ON に）', async ({ page }) => {
    await expect(page.getByTestId('legend-wind-vectors')).toBeVisible();
    await expect(page.getByTestId('legend-wind-vectors')).not.toBeChecked();
  });

  test('卓越風トグルを ON / OFF すると Canvas 描画が変わる', async ({ page }) => {
    // Step 4 final wind が同じ位置に描画されるため、Step 2 の効果を観察するには Step 4 を一旦 OFF にする。
    await page.getByTestId('legend-final-wind').uncheck();
    await page.waitForTimeout(150);
    const beforeStep2On = await canvasFingerprint(page);
    await page.getByTestId('legend-wind-vectors').check();
    await page.waitForTimeout(150);
    const afterStep2On = await canvasFingerprint(page);
    expect(afterStep2On).not.toBe(beforeStep2On);
    await page.getByTestId('legend-wind-vectors').uncheck();
    await page.waitForTimeout(150);
    const afterStep2Off = await canvasFingerprint(page);
    expect(afterStep2Off).not.toBe(afterStep2On);
  });

  test('卓越風 代表速さスライダーを変えると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-wind-mean-speed', '15');
    // P4-8 で Step 4 の追加処理（pressureCenter 検出 12 ヶ月分・mountain deflection・
    // monsoon reversal）+ P4-9 で Step 5 の追加処理（緯度別日射 + 海岸距離 BFS + 雪氷反復）
    // により pipeline が重くなったため、十分な待機時間を確保する。
    await page.waitForTimeout(1100);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 2 風帯既定値（地球プリセット）が初期表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-wind-subtropical-shift')).toHaveValue('5');
    await expect(page.getByTestId('slider-wind-continental-anomaly')).toHaveValue('5');
    await expect(page.getByTestId('slider-wind-mean-speed')).toHaveValue('5');
  });
});
