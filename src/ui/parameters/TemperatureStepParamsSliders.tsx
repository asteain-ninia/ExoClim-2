// Step 5 気温チューニングパラメータ調整 UI（[docs/spec/05_気温.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_TEMPERATURE_STEP_PARAMS`（[src/sim/05_temperature.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setTemperatureParams` で部分更新する。

import { DEFAULT_TEMPERATURE_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function TemperatureStepParamsSliders() {
  const temperatureParams = useParamsStore((s) => s.temperatureParams);
  const setTemperatureParams = useParamsStore((s) => s.setTemperatureParams);

  return (
    <fieldset className="param-group" data-testid="param-group-temperature">
      <legend>気温 調整（Step 5）</legend>
      <Slider
        id="temperature-baseline"
        label="全球平均気温"
        unit="°C"
        min={-10}
        max={35}
        step={0.5}
        precision={1}
        value={temperatureParams.globalMeanBaselineCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.globalMeanBaselineCelsius}
        onChange={(v) => setTemperatureParams({ globalMeanBaselineCelsius: v })}
      />
      <Slider
        id="temperature-continentality"
        label="大陸性 強度"
        unit="×"
        min={0}
        max={2}
        step={0.05}
        precision={2}
        value={temperatureParams.continentalityStrength}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.continentalityStrength}
        onChange={(v) => setTemperatureParams({ continentalityStrength: v })}
      />
      <Slider
        id="temperature-wind-advection"
        label="風移流補正 強度"
        unit="×"
        min={0}
        max={1}
        step={0.05}
        precision={2}
        value={temperatureParams.windAdvectionStrength}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.windAdvectionStrength}
        onChange={(v) => setTemperatureParams({ windAdvectionStrength: v })}
      />
      <Slider
        id="temperature-snow-ice-iterations"
        label="雪氷フィードバック 反復"
        unit="回"
        min={0}
        max={3}
        step={1}
        precision={0}
        value={temperatureParams.snowIceFeedbackIterations}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.snowIceFeedbackIterations}
        onChange={(v) => setTemperatureParams({ snowIceFeedbackIterations: v })}
      />
      <Slider
        id="temperature-evapotranspiration-coef"
        label="蒸発散量 係数"
        unit="mm/月/°C"
        min={0}
        max={20}
        step={0.5}
        precision={1}
        value={temperatureParams.evapotranspirationCoefficientMmPerCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.evapotranspirationCoefficientMmPerCelsius}
        onChange={(v) =>
          setTemperatureParams({ evapotranspirationCoefficientMmPerCelsius: v })
        }
      />
      <Slider
        id="temperature-isotherm-interval"
        label="等温線 刻み幅"
        unit="°C"
        min={0}
        max={30}
        step={1}
        precision={0}
        value={temperatureParams.isothermIntervalCelsius}
        defaultValue={DEFAULT_TEMPERATURE_STEP_PARAMS.isothermIntervalCelsius}
        onChange={(v) => setTemperatureParams({ isothermIntervalCelsius: v })}
      />
    </fieldset>
  );
}
