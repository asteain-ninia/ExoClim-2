// 計算層エントリポイント。
// 各 Step（ITCZ・風帯・海流・気流・気温・降水・気候帯）を純粋関数として実装する
// （[技術方針.md §1.5.1] [§2.1.2]）。

export type { ITCZStepParams } from './01_itcz';
export { DEFAULT_ITCZ_STEP_PARAMS, computeITCZ, solarDeclinationDeg } from './01_itcz';
