// 状態層エントリポイント。
// Zustand store によるパラメータ・結果・UI 状態の保持（[技術方針.md §2.1.4] / [要件定義書.md §5.4]）。

export type { ParamsActions, ParamsState, ParamsStore } from './params';
export { createParamsStore, useParamsStore } from './params';

export type { ResultsActions, ResultsState, ResultsStore } from './results';
export { createResultsStore, useResultsStore } from './results';

export type {
  CurrentStepView,
  LegendVisibility,
  SeasonPhaseView,
  UIActions,
  UIState,
  UIStore,
} from './ui';
export { createUIStore, useUIStore } from './ui';

export type { ConnectStoresOptions } from './connection';
export { connectStoresToBridge } from './connection';

export type {
  Notification,
  NotificationLevel,
  NotificationsActions,
  NotificationsState,
  NotificationsStore,
} from './notifications';
export { createNotificationsStore, useNotificationsStore } from './notifications';

export type { ParamsSnapshot, ParamsSnapshotPayload } from './settingsIo';
export {
  applySnapshot,
  clearParamsLocalStorage,
  isValidSnapshot,
  loadParamsFromLocalStorage,
  PARAMS_LOCAL_STORAGE_KEY,
  saveParamsToLocalStorage,
  serializeParams,
} from './settingsIo';
