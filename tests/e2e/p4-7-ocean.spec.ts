// P4-7 Step 3 海流の E2E 検証。
// 仕様: [docs/spec/03_海流.md §4 / §5] / [要件定義書.md §2.2.3]。

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

test.describe('P4-7: Step 3 海流', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // pipeline 完了 (ITCZ 帯赤 + 海流 overlay) を待つ
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
    // Step 5 (P4-9) を pipeline に追加して初期計算が長くなったため十分な待機を取る。
    await page.waitForTimeout(900);
  });

  test('Step 3 海流パネル（5 スライダー）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-ocean-current')).toBeVisible();
    for (const id of [
      'slider-ocean-warm-rise',
      'slider-ocean-cold-drop',
      'slider-ocean-influence-range',
      'slider-ocean-sea-ice-lat',
      'slider-ocean-basin-neutral-width',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('凡例に「海流」「海氷」トグルが表示され、既定で ON', async ({ page }) => {
    await expect(page.getByTestId('legend-ocean-currents')).toBeVisible();
    await expect(page.getByTestId('legend-ocean-currents')).toBeChecked();
    await expect(page.getByTestId('legend-sea-ice')).toBeVisible();
    await expect(page.getByTestId('legend-sea-ice')).toBeChecked();
  });

  test('海流トグルを OFF にすると Canvas 描画が変わる（暖寒流の色付けが消える）', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-ocean-currents').uncheck();
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('海氷トグルを OFF にすると Canvas 描画が変わる（極の白覆いが消える）', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-sea-ice').uncheck();
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('海氷しきい値を 50° に下げると Canvas 描画が変わる（白覆いが拡大）', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-ocean-sea-ice-lat', '50');
    await page.waitForTimeout(900);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 3 海流既定値が表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-ocean-warm-rise')).toHaveValue('15');
    await expect(page.getByTestId('slider-ocean-cold-drop')).toHaveValue('10');
    await expect(page.getByTestId('slider-ocean-sea-ice-lat')).toHaveValue('70');
  });
});
