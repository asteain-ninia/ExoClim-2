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
        label="圧力勾配風 強度"
        unit="×"
        min={0}
        max={3}
        step={0.05}
        precision={2}
        value={airflowParams.pressureGradientCoefficient}
        defaultValue={DEFAULT_AIRFLOW_STEP_PARAMS.pressureGradientCoefficient}
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
        onChange={(v) => setAirflowParams({ mountainDeflectionThresholdMeters: v })}
      />
    </fieldset>
  );
}
