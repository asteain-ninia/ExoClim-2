// Step 2 風帯チューニングパラメータ調整 UI（[docs/spec/02_風帯.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_WIND_BELT_STEP_PARAMS`（[src/sim/02_wind_belt.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setWindBeltParams` で部分更新する。

import { DEFAULT_WIND_BELT_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function WindBeltStepParamsSliders() {
  const windBeltParams = useParamsStore((s) => s.windBeltParams);
  const setWindBeltParams = useParamsStore((s) => s.setWindBeltParams);

  return (
    <fieldset className="param-group" data-testid="param-group-wind-belt">
      <legend>風帯 調整（Step 2）</legend>
      <Slider
        id="wind-subtropical-shift"
        label="亜熱帯高気圧 季節移動"
        unit="°"
        min={0}
        max={15}
        step={0.5}
        precision={1}
        value={windBeltParams.subtropicalHighSeasonalShiftDeg}
        defaultValue={DEFAULT_WIND_BELT_STEP_PARAMS.subtropicalHighSeasonalShiftDeg}
        onChange={(v) => setWindBeltParams({ subtropicalHighSeasonalShiftDeg: v })}
      />
      <Slider
        id="wind-continental-anomaly"
        label="大陸気圧 anomaly 強度"
        unit="hPa"
        min={0}
        max={15}
        step={0.5}
        precision={1}
        value={windBeltParams.continentalPressureAnomalyHpa}
        defaultValue={DEFAULT_WIND_BELT_STEP_PARAMS.continentalPressureAnomalyHpa}
        onChange={(v) => setWindBeltParams({ continentalPressureAnomalyHpa: v })}
      />
      <Slider
        id="wind-mean-speed"
        label="卓越風 代表速さ"
        unit="m/s"
        min={0}
        max={20}
        step={0.5}
        precision={1}
        value={windBeltParams.meanWindSpeedMps}
        defaultValue={DEFAULT_WIND_BELT_STEP_PARAMS.meanWindSpeedMps}
        onChange={(v) => setWindBeltParams({ meanWindSpeedMps: v })}
      />
    </fieldset>
  );
}
