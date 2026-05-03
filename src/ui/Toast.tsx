// 通知 toast の表示コンテナ。画面右下に積み重ねて表示。
// 仕様: [現状.md §6 U20] エラー表示・通知。
// 規約:
//   - notifications store のみを購読
//   - auto-dismiss: 各 toast は 5 秒後に自動的に消える（手動 ✕ ボタンも提供）
//   - レベル別配色（error: 赤 / warning: 黄 / info: 青）

import { useEffect } from 'react';
import { useNotificationsStore, type Notification } from '@/store';

const AUTO_DISMISS_MS = 5000;

export function Toast() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const dismiss = useNotificationsStore((s) => s.dismiss);

  return (
    <div className="toast-container" data-testid="toast-container" aria-live="polite">
      {notifications.map((n) => (
        <ToastItem key={n.id} notification={n} onDismiss={() => dismiss(n.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  notification,
  onDismiss,
}: {
  readonly notification: Notification;
  readonly onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`toast toast--${notification.level}`}
      role={notification.level === 'error' ? 'alert' : 'status'}
      data-testid={`toast-${notification.level}`}
    >
      <span className="toast__message">{notification.message}</span>
      <button
        type="button"
        className="toast__dismiss"
        onClick={onDismiss}
        aria-label="通知を閉じる"
        data-testid="toast-dismiss"
      >
        ✕
      </button>
    </div>
  );
}
