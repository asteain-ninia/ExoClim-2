import { describe, expect, it } from 'vitest';
import { createNotificationsStore } from '@/store/notifications';

describe('store/notifications', () => {
  it('初期状態は空配列', () => {
    const store = createNotificationsStore();
    expect(store.getState().notifications).toEqual([]);
  });

  it('push でレベルとメッセージが追加される', () => {
    const store = createNotificationsStore();
    store.getState().push('error', 'foo');
    const ns = store.getState().notifications;
    expect(ns.length).toBe(1);
    expect(ns[0]?.level).toBe('error');
    expect(ns[0]?.message).toBe('foo');
  });

  it('連続同一メッセージは重複抑制（直近 1 件と一致なら追加しない）', () => {
    const store = createNotificationsStore();
    store.getState().push('error', 'same');
    store.getState().push('error', 'same');
    expect(store.getState().notifications.length).toBe(1);
  });

  it('異なるメッセージは追加される', () => {
    const store = createNotificationsStore();
    store.getState().push('error', 'a');
    store.getState().push('error', 'b');
    expect(store.getState().notifications.length).toBe(2);
  });

  it('上限 5 件を超えたら古い順に切り捨て', () => {
    const store = createNotificationsStore();
    for (let i = 0; i < 8; i++) store.getState().push('info', `msg${i}`);
    const ns = store.getState().notifications;
    expect(ns.length).toBe(5);
    // 最古は msg3、最新は msg7
    expect(ns[0]?.message).toBe('msg3');
    expect(ns[ns.length - 1]?.message).toBe('msg7');
  });

  it('dismiss で指定 id の通知が消える', () => {
    const store = createNotificationsStore();
    store.getState().push('info', 'a');
    store.getState().push('info', 'b');
    const targetId = store.getState().notifications[0]!.id;
    store.getState().dismiss(targetId);
    const ns = store.getState().notifications;
    expect(ns.length).toBe(1);
    expect(ns[0]?.message).toBe('b');
  });

  it('clear で全消去', () => {
    const store = createNotificationsStore();
    store.getState().push('info', 'a');
    store.getState().push('warning', 'b');
    store.getState().clear();
    expect(store.getState().notifications).toEqual([]);
  });
});
