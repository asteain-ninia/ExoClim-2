// 折りたたみ可能なセクションラッパ。
// 仕様: [現状.md §6 U2] パラメータパネル 13 セクションが縦並びの問題への対応。
// 規約:
//   - HTML <details><summary> をベースにキーボード・スクリーンリーダ対応を継承
//   - 内部子要素の <fieldset><legend> は CSS で非表示にし、summary を見出しとする
//   - initiallyOpen は既定 true（既存 E2E への影響を最小化）

import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  /** セクション見出し（summary に表示される）。 */
  readonly title: string;
  /** 既定で開くか（既定 true）。 */
  readonly initiallyOpen?: boolean;
  /** data-testid プレフィックス（例: "section-orbital"）。 */
  readonly testId?: string;
  readonly children: ReactNode;
}

export function CollapsibleSection({
  title,
  initiallyOpen = true,
  testId,
  children,
}: CollapsibleSectionProps) {
  return (
    <details
      className="collapsible-section"
      open={initiallyOpen}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <summary className="collapsible-section__summary">{title}</summary>
      <div className="collapsible-section__body">{children}</div>
    </details>
  );
}
