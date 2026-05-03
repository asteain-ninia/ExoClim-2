// P4-7 Step 3 海流の E2E 検証。
// 仕様: [docs/spec/03_海流.md §4 / §5] / [要件定義書.md §2.2.3]。

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
    await openAllCollapsibleSections(page);
  });

  test('Step 3 海流パネル（13 スライダー + 寒流延長 / ENSO トグル）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-ocean-current')).toBeVisible();
    for (const id of [
      'slider-ocean-warm-rise',
      'slider-ocean-cold-drop',
      'slider-ocean-influence-range',
      'slider-ocean-sea-ice-lat',
      'slider-ocean-basin-neutral-width',
      'slider-ocean-streamline-basin-min-width',
      'slider-ocean-streamline-equatorial-lat',
      'slider-ocean-streamline-mid-lat',
      'slider-ocean-streamline-polar-lat',
      'slider-ocean-streamline-samples-per-edge',
      'slider-ocean-cold-extension-min-lat',
      'slider-ocean-cold-extension-proximity',
      'slider-ocean-enso-lat-range',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // 寒流延長 + ENSO 有効/無効トグル
    await expect(page.getByTestId('ocean-cold-extension-on')).toBeVisible();
    await expect(page.getByTestId('ocean-cold-extension-off')).toBeVisible();
    await expect(page.getByTestId('ocean-enso-on')).toBeVisible();
    await expect(page.getByTestId('ocean-enso-off')).toBeVisible();
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

  test('海流ストリームライン トグルが表示され、既定 ON、OFF にすると描画が変わる', async ({
    page,
  }) => {
    // 表示トグルにストリームライン項目が追加されている（[docs/spec/03_海流.md §4.1〜§4.5]）
    await expect(page.getByTestId('legend-ocean-streamlines')).toBeVisible();
    await expect(page.getByTestId('legend-ocean-streamlines')).toBeChecked();
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-ocean-streamlines').uncheck();
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('海流衝突点 トグルが表示され、既定 ON、OFF にすると描画が変わる', async ({
    page,
  }) => {
    await expect(page.getByTestId('legend-collision-points')).toBeVisible();
    await expect(page.getByTestId('legend-collision-points')).toBeChecked();
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-collision-points').uncheck();
    await page.waitForTimeout(200);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('ENSO 候補マスク トグルが表示され、既定 OFF、ON にすると描画が変わる（[§4.10]）', async ({
    page,
  }) => {
    await expect(page.getByTestId('legend-enso-candidate')).toBeVisible();
    await expect(page.getByTestId('legend-enso-candidate')).not.toBeChecked();
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-enso-candidate').check();
    await page.waitForTimeout(200);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('沿岸湧昇マスク トグルが表示され、既定 OFF、ON にすると描画が変わる', async ({
    page,
  }) => {
    // 表示トグルに沿岸湧昇項目が追加されている（[docs/spec/02_風帯.md] / [docs/spec/03_海流.md §既知の未対応事項]）
    await expect(page.getByTestId('legend-coastal-upwelling')).toBeVisible();
    await expect(page.getByTestId('legend-coastal-upwelling')).not.toBeChecked();
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-coastal-upwelling').check();
    await page.waitForTimeout(200);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('月別表示にすると寒流沿い東岸海氷延長で描画が変わる（[§4.7]、Worldbuilder\'s Log #28）', async ({
    page,
  }) => {
    // 既定では年平均（'annual'）表示。buildSeaIceBitmap は年平均では緯度しきい値のみを
    // 使い、月別では oceanCurrent.monthlySeaIceMask を読み取る。1 月（NH 冬、index 0）に
    // 切替えると寒流沿い東岸延長が表示され、年平均と Canvas 指紋が変わる。
    const annualFingerprint = await canvasFingerprint(page);
    await page.getByTestId('season-0').click();
    await page.waitForTimeout(900);
    const janFingerprint = await canvasFingerprint(page);
    expect(janFingerprint).not.toBe(annualFingerprint);
  });
});
