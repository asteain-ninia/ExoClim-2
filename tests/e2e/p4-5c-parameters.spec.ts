// P4-5c パラメータ調整 UI（AtmosphereOcean / TerrainSource / ITCZStepParams）の E2E 検証。
// 仕様: [要件定義書.md §2.3.6] UI 未露出のパラメータは存在しない要件の完了。

import { expect, test, type Page } from '@playwright/test';

/**
 * range input の値を React 互換に設定する。
 * `Locator.fill` は range input でエラーになるため、native setter 経由で
 * value を設定し input/change イベントを bubbles で発火する。
 */
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

test.describe('P4-5c: 残りパラメータ UI（AtmosphereOcean / TerrainSource / ITCZStepParams）', () => {
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
    await page.waitForTimeout(150);
  });

  test('AtmosphereOceanParams 9 スライダーがすべて表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-atmosphere-ocean')).toBeVisible();
    for (const id of [
      'slider-atm-pressure',
      'slider-atm-greenhouse',
      'slider-atm-surface-albedo',
      'slider-atm-cloud-albedo',
      'slider-atm-lapse-rate',
      'slider-atm-meridional-transport',
      'slider-atm-zonal-transport',
      'slider-atm-ocean-depth',
      'slider-atm-ocean-coverage',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('AtmosphereOcean 既定値が地球プリセット', async ({ page }) => {
    await expect(page.getByTestId('slider-atm-pressure')).toHaveValue('1013');
    await expect(page.getByTestId('slider-atm-lapse-rate')).toHaveValue('4.5');
    await expect(page.getByTestId('slider-atm-ocean-coverage')).toHaveValue('0.71');
  });

  test('TerrainSource: プリセット切替で Canvas 描画が変わる', async ({ page }) => {
    const beforeEarth = await canvasFingerprint(page);
    await page.getByTestId('terrain-preset-id').selectOption('no_land');
    // 地形再生成 + pipeline 再実行を待つ
    await page.waitForTimeout(300);
    const afterNoLand = await canvasFingerprint(page);
    expect(afterNoLand).not.toBe(beforeEarth);
  });

  test('TerrainSource: 種別を「手続き生成」に切替えると seed / 陸地割合スライダーが現れる', async ({
    page,
  }) => {
    await page.getByTestId('terrain-kind-procedural').click();
    await expect(page.getByTestId('slider-terrain-seed')).toBeVisible();
    await expect(page.getByTestId('slider-terrain-land-fraction')).toBeVisible();
    // プリセットセレクタは消える
    await expect(page.getByTestId('terrain-preset-id')).not.toBeVisible();
  });

  test('TerrainSource: 手続き生成で seed を変えると Canvas 描画が変わる', async ({ page }) => {
    await page.getByTestId('terrain-kind-procedural').click();
    await page.waitForTimeout(800);
    const beforeSeed = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-terrain-seed', '100');
    // 地形生成 + Step 1〜4 全て再計算なので待機を長めに
    await page.waitForTimeout(1500);
    const afterSeed = await canvasFingerprint(page);
    expect(afterSeed).not.toBe(beforeSeed);
  });

  test('ITCZStepParams 4 スライダーがすべて表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-itcz')).toBeVisible();
    for (const id of [
      'slider-itcz-half-width',
      'slider-itcz-smoothing',
      'slider-itcz-monsoon-pull',
      'slider-itcz-mountain-cutoff',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('ITCZ 影響帯半幅スライダーを動かすと帯の幅が視覚的に変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    // 既定 15° → 5° に縮める。中心線は変わらず帯のみ細くなる
    await setRangeValue(page, 'slider-itcz-half-width', '5');
    await page.waitForTimeout(500);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('ITCZ モンスーン引き寄せ強度を 0 にすると年平均 ITCZ が真直ぐになる', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-itcz-monsoon-pull', '0');
    await page.waitForTimeout(500);
    const after = await canvasFingerprint(page);
    // 地球地形では landFraction の差で年平均線が陸海バランスに引き寄せられている。
    // 0 にすると一様に赤道の直線に戻るので描画が変わる。
    expect(after).not.toBe(before);
  });
});
