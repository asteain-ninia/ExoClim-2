// 状態層 notifications store。worker エラーや UI 通知を toast 表示するためのキュー。
// 仕様: [現状.md §6 U20] エラー表示・通知。
// 規約:
//   - 永続化対象外（一時的な通知）
//   - 最大 5 件まで保持（古いものを切り捨て）
//   - auto-dismiss は UI 側で実装（store は dismiss action のみ提供）

import { create } from 'zustand';

export type NotificationLevel = 'error' | 'warning' | 'info';

export interface Notification {
  readonly id: number;
  readonly level: NotificationLevel;
  readonly message: string;
  /** 作成タイムスタンプ（ms）。デバッグや並び順検証に使う。 */
  readonly createdAtMs: number;
}

const MAX_NOTIFICATIONS = 5;

export interface NotificationsState {
  readonly notifications: ReadonlyArray<Notification>;
}

export interface NotificationsActions {
  /** 新しい通知を追加。同一 message が直近にあれば追加しない（重複抑制）。 */
  readonly push: (level: NotificationLevel, message: string) => void;
  /** 指定 id の通知を消す。 */
  readonly dismiss: (id: number) => void;
  /** 全通知をクリア。 */
  readonly clear: () => void;
}

export type NotificationsStore = NotificationsState & NotificationsActions;

let nextId = 1;

export const createNotificationsStore = () =>
  create<NotificationsStore>((set, get) => ({
    notifications: [],
    push: (level, message) => {
      const current = get().notifications;
      // 直近 1 件と同じメッセージなら重複抑制
      const last = current[current.length - 1];
      if (last && last.message === message && last.level === level) return;
      const newOne: Notification = {
        id: nextId++,
        level,
        message,
        createdAtMs: Date.now(),
      };
      const next = [...current, newOne];
      // 上限 MAX_NOTIFICATIONS を超えたら古いものを切り捨て
      const trimmed = next.length > MAX_NOTIFICATIONS ? next.slice(-MAX_NOTIFICATIONS) : next;
      set({ notifications: trimmed });
    },
    dismiss: (id) => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    },
    clear: () => set({ notifications: [] }),
  }));

export const useNotificationsStore = createNotificationsStore();
