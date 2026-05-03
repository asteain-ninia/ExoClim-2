// E2E テスト共通ヘルパ。
// 仕様: [現状.md §6 U5] パラメータパネル初期状態最適化（P4-38）に伴い、
//   既存テストが details 内のスライダー等にアクセスできるよう、全 collapsible
//   セクションを開ける処理を提供する。

import type { Page } from '@playwright/test';

/**
 * 画面内のすべての <details> 要素を `open=true` にする。
 *
 * P4-28 で `<CollapsibleSection>` 導入、P4-38 で初期状態を選択的に close
 * （Step 調整パネルなど）にしたため、既存 E2E が要素を見つけられない問題が
 * 起きる。本ヘルパを `beforeEach` で呼ぶことで E2E 動作を維持する。
 */
export async function openAllCollapsibleSections(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('details'))) {
      d.open = true;
    }
  });
}

/**
 * 上級モード（U19、P4-43）を ON にする。
 *
 * 既定 OFF のため `advanced` フラグ付きスライダー（海流 streamline 系・agent 系・
 * ENSO 緯度範囲など）が画面に存在しない。これらにアクセスする E2E は
 * `beforeEach` で本ヘルパを呼ぶこと。トグルが既に ON なら何もしない。
 */
export async function enableAdvancedMode(page: Page): Promise<void> {
  const toggle = page.getByTestId('app-advanced-mode-toggle');
  const pressed = await toggle.getAttribute('aria-pressed');
  if (pressed !== 'true') {
    await toggle.click();
  }
}
