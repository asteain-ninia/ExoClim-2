// 初回起動時に表示するオンボーディングモーダル（[現状.md §6 U14]、P4-44）。
// 規約:
//   - 初回起動時のみ自動表示。dismiss すると localStorage に既読フラグを書く
//   - フラグは versioned（'exoclim-onboarded' = 'v1'）。将来 v2 リニューアル時に
//     再表示できる
//   - manual=true で開いた場合は dismiss しても既読フラグを書かない（再オープン
//     用途でリセットされない）
//   - 3 スライド構成: ようこそ / 7 Step pipeline / 主要操作
//   - Esc キーで閉じる、背景クリックで閉じる、Skip ボタンで閉じる、最終スライドの
//     「始める」ボタンで閉じる

import { useEffect, useState } from 'react';

const ONBOARDING_KEY = 'exoclim-onboarded';
const ONBOARDING_VERSION = 'v1';

interface Slide {
  readonly title: string;
  readonly body: React.ReactNode;
}

const SLIDES: readonly Slide[] = [
  {
    title: 'ExoClim へようこそ',
    body: (
      <>
        <p>
          このアプリは <strong>Worldbuilding Pasta</strong>（YouTube
          “Worldbuilder’s Log” / “An Apple Pie from Scratch”）で解説される
          惑星気候設計手法を、対話的に再現するツールです。
        </p>
        <p>
          軌道・地形・大気のパラメータを変えると、気候帯がどう変わるかを
          すぐに確認できます。
        </p>
      </>
    ),
  },
  {
    title: '7 Step で気候を導出',
    body: (
      <>
        <p>左から右へ順に計算します:</p>
        <ol className="onboarding-modal__list">
          <li>
            <strong>ITCZ</strong>（赤道収束帯）
          </li>
          <li>
            <strong>風帯</strong>（貿易風・偏西風）
          </li>
          <li>
            <strong>海流</strong>（亜熱帯ジャイヤ・赤道反流・極ジャイヤ）
          </li>
          <li>
            <strong>気流</strong>（地表風 + 圧力 anomaly）
          </li>
          <li>
            <strong>気温</strong>（緯度 + 標高 + 海流補正）
          </li>
          <li>
            <strong>降水</strong>（湿潤帯・雨陰砂漠）
          </li>
          <li>
            <strong>気候帯</strong>（Köppen-Geiger）
          </li>
        </ol>
        <p>表示する Step は地図の下のタブで切替えられます（実装予定）。</p>
      </>
    ),
  },
  {
    title: '主要な操作',
    body: (
      <>
        <ul className="onboarding-modal__list">
          <li>
            画面右側の <strong>パラメータ</strong>{' '}
            セクションで軌道・地形・各 Step の値を調整
          </li>
          <li>
            ヘッダー右の{' '}
            <strong>☆ 上級モード</strong>{' '}
            で流線サンプル数等の詳細スライダーを表示
          </li>
          <li>
            <strong>表示トグル</strong> で overlay（ITCZ / 海流 / 気温など）の
            ON/OFF を切替
          </li>
          <li>
            数字キー <code>0</code> = 年平均、<code>1</code> = 1月、
            <code>2</code> = 4月、<code>3</code> = 7月、<code>4</code> = 10月
          </li>
          <li>
            <strong>↺ 全リセット</strong> で全パラメータを地球プリセットに復帰、
            <strong>JSON 入出力</strong> で設定の保存・共有が可能
          </li>
        </ul>
        <p>このガイドはヘッダー右の「❓ ヘルプ」からいつでも再表示できます。</p>
      </>
    ),
  },
];

export interface OnboardingModalProps {
  /** 外部から表示状態を制御する場合に指定。未指定なら localStorage 連動の自動表示 */
  readonly forceOpen?: boolean;
  /** 閉じた時のコールバック（manual モードで使用） */
  readonly onClose?: () => void;
}

export function OnboardingModal({ forceOpen, onClose }: OnboardingModalProps) {
  const [autoOpen, setAutoOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    if (forceOpen !== undefined) return;
    try {
      if (typeof window !== 'undefined') {
        const flag = window.localStorage.getItem(ONBOARDING_KEY);
        if (flag !== ONBOARDING_VERSION) {
          setAutoOpen(true);
          setSlideIndex(0);
        }
      }
    } catch {
      // localStorage 不可（プライベートモード等）でも黙ってスキップ
    }
  }, [forceOpen]);

  useEffect(() => {
    if (forceOpen) {
      setSlideIndex(0);
    }
  }, [forceOpen]);

  const isOpen = forceOpen !== undefined ? forceOpen : autoOpen;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  function handleClose() {
    if (forceOpen === undefined) {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(ONBOARDING_KEY, ONBOARDING_VERSION);
        }
      } catch {
        // localStorage 失敗は無視（次回も表示されるが致命的ではない）
      }
      setAutoOpen(false);
    }
    onClose?.();
  }

  const isLast = slideIndex === SLIDES.length - 1;
  const slide = SLIDES[slideIndex];
  if (!slide) return null;

  return (
    <div
      className="onboarding-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-overlay"
      onClick={handleClose}
    >
      <div
        className="onboarding-modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="onboarding-modal"
      >
        <button
          type="button"
          className="onboarding-modal__close"
          onClick={handleClose}
          aria-label="ガイドを閉じる"
          data-testid="onboarding-close"
        >
          ✕
        </button>
        <h2 id="onboarding-title" className="onboarding-modal__title">
          {slide.title}
        </h2>
        <div className="onboarding-modal__body">{slide.body}</div>
        <div className="onboarding-modal__footer">
          <div className="onboarding-modal__dots" aria-hidden="true">
            {SLIDES.map((_, i) => (
              <span
                key={i}
                className={
                  i === slideIndex
                    ? 'onboarding-modal__dot onboarding-modal__dot--active'
                    : 'onboarding-modal__dot'
                }
              />
            ))}
          </div>
          <div className="onboarding-modal__actions">
            <button
              type="button"
              className="onboarding-modal__btn onboarding-modal__btn--ghost"
              onClick={handleClose}
              data-testid="onboarding-skip"
            >
              スキップ
            </button>
            {slideIndex > 0 && (
              <button
                type="button"
                className="onboarding-modal__btn"
                onClick={() => setSlideIndex(slideIndex - 1)}
                data-testid="onboarding-prev"
              >
                ← 戻る
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                className="onboarding-modal__btn onboarding-modal__btn--primary"
                onClick={() => setSlideIndex(slideIndex + 1)}
                data-testid="onboarding-next"
              >
                次へ →
              </button>
            )}
            {isLast && (
              <button
                type="button"
                className="onboarding-modal__btn onboarding-modal__btn--primary"
                onClick={handleClose}
                data-testid="onboarding-done"
              >
                始める
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** テストや初期化リセット用: localStorage から既読フラグを除去する。 */
export function resetOnboardingFlag(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ONBOARDING_KEY);
    }
  } catch {
    // ignore
  }
}

export const ONBOARDING_LOCAL_STORAGE_KEY = ONBOARDING_KEY;
export const ONBOARDING_LOCAL_STORAGE_VALUE = ONBOARDING_VERSION;
