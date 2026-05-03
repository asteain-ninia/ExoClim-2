// Step 1 ITCZ チューニングパラメータ調整 UI（[docs/spec/01_ITCZ.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_ITCZ_STEP_PARAMS`（[src/sim/01_itcz.ts]）を地球プリセット
//   復帰値として使う。状態層 params store の `setITCZParams` で部分更新する。
//
// 注: baseInfluenceHalfWidthDeg は [src/ui/map/MapCanvas.tsx] の表示帯幅にも追従する
//   （山岳切取の data 値ではなく、表示用一様幅として使用）。

import { DEFAULT_ITCZ_STEP_PARAMS } from '@/sim/01_itcz';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function ITCZStepParamsSliders() {
  const itczParams = useParamsStore((s) => s.itczParams);
  const setITCZParams = useParamsStore((s) => s.setITCZParams);

  return (
    <fieldset className="param-group" data-testid="param-group-itcz">
      <legend>ITCZ 調整（Step 1）</legend>
      <Slider
        id="itcz-half-width"
        label="影響帯半幅"
        unit="°"
        min={0}
        max={30}
        step={0.5}
        precision={1}
        value={itczParams.baseInfluenceHalfWidthDeg}
        defaultValue={DEFAULT_ITCZ_STEP_PARAMS.baseInfluenceHalfWidthDeg}
        helpText="ITCZ 中心線の南北 ±この度の帯を「ITCZ 影響圏」として表示・降水評価に使う（地球 = 約 ±15°）。"
        onChange={(v) => setITCZParams({ baseInfluenceHalfWidthDeg: v })}
      />
      <Slider
        id="itcz-smoothing"
        label="平滑化窓幅"
        unit="°"
        min={0}
        max={90}
        step={1}
        precision={0}
        value={itczParams.smoothingWindowDeg}
        defaultValue={DEFAULT_ITCZ_STEP_PARAMS.smoothingWindowDeg}
        onChange={(v) => setITCZParams({ smoothingWindowDeg: v })}
      />
      <Slider
        id="itcz-monsoon-pull"
        label="モンスーン引き寄せ強度"
        unit="°"
        min={0}
        max={15}
        step={0.5}
        precision={1}
        value={itczParams.monsoonPullStrengthDeg}
        defaultValue={DEFAULT_ITCZ_STEP_PARAMS.monsoonPullStrengthDeg}
        helpText="夏半球の大陸上で ITCZ が極側に追加で引き寄せられる量（地球のインドモンスーン効果に対応）。0 で線型移動。"
        onChange={(v) => setITCZParams({ monsoonPullStrengthDeg: v })}
      />
      <Slider
        id="itcz-mountain-cutoff"
        label="山岳切取しきい値"
        unit="m"
        min={1000}
        max={8000}
        step={100}
        precision={0}
        value={itczParams.mountainCutoffMeters}
        defaultValue={DEFAULT_ITCZ_STEP_PARAMS.mountainCutoffMeters}
        onChange={(v) => setITCZParams({ mountainCutoffMeters: v })}
      />
    </fieldset>
  );
}
