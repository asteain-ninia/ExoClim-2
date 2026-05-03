// Step 4 気流チューニングパラメータ調整 UI（[docs/spec/04_気流.md §6.1]）。

import { DEFAULT_AIRFLOW_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function AirflowStepParamsSliders() {
  const airflowParams = useParamsStore((s) => s.airflowParams);
  const setAirflowParams = useParamsStore((s) => s.setAirflowParams);

  return (
    <fieldset className="param-group" data-testid="param-group-airflow">
      <legend>気流 調整（Step 4）</legend>
      <Slider
        id="airflow-pressure-gradient"
        label="圧力勾配風 合成強度"
        unit="×"
        min={0}
        max={3}
        step={0.05}
        precision={2}
        value={airflowParams.pressureGradientCoefficient}
        defaultValue={DEFAULT_AIRFLOW_STEP_PARAMS.pressureGradientCoefficient}
        helpText="卓越風（地球規模）に圧力勾配風（局所気圧差由来）を合成する係数。0 で卓越風のみ、1 で地衡風近似、3 で過剰強調。"
        onChange={(v) => setAirflowParams({ pressureGradientCoefficient: v })}
      />
      <Slider
        id="airflow-mountain-threshold"
        label="山脈偏向 しきい値"
        unit="m"
        min={500}
        max={6000}
        step={100}
        precision={0}
        value={airflowParams.mountainDeflectionThresholdMeters}
        defaultValue={DEFAULT_AIRFLOW_STEP_PARAMS.mountainDeflectionThresholdMeters}
        helpText="この標高を超える山脈で風が偏向される（既定 2,000 m）。低くすると山岳の影響範囲が広がる。"
        onChange={(v) => setAirflowParams({ mountainDeflectionThresholdMeters: v })}
      />
      <Slider
        id="airflow-monsoon-reversal"
        label="モンスーン反転 強度"
        unit="×"
        min={0}
        max={1}
        step={0.05}
        precision={2}
        value={airflowParams.monsoonReversalStrength}
        defaultValue={DEFAULT_AIRFLOW_STEP_PARAMS.monsoonReversalStrength}
        helpText="夏半球の大陸内陸で風向きが反転する強度（地球のインドモンスーンに対応）。0 で反転なし。"
        onChange={(v) => setAirflowParams({ monsoonReversalStrength: v })}
      />
      <Slider
        id="airflow-pressure-center-threshold"
        label="気圧中心 検出しきい値"
        unit="hPa"
        min={0.5}
        max={10}
        step={0.5}
        precision={1}
        value={airflowParams.pressureCenterThresholdHpa}
        defaultValue={DEFAULT_AIRFLOW_STEP_PARAMS.pressureCenterThresholdHpa}
        helpText="この hPa 以上の気圧異常を「気圧中心（H/L マーカー）」として検出。低いと小さな極小・極大も拾う。"
        advanced
        onChange={(v) => setAirflowParams({ pressureCenterThresholdHpa: v })}
      />
    </fieldset>
  );
}
