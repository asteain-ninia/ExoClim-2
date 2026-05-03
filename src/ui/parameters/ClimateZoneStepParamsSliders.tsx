// Step 7 気候帯チューニングパラメータ調整 UI（[docs/spec/07_気候帯.md §6.1]）。
// 規約: ドメイン層と独立した `DEFAULT_CLIMATE_ZONE_STEP_PARAMS`（[src/sim/07_climate_zone.ts]）を
//   既定値復帰の基準とし、状態層 params store の `setClimateZoneParams` で部分更新する。

import { DEFAULT_CLIMATE_ZONE_STEP_PARAMS } from '@/sim';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

export function ClimateZoneStepParamsSliders() {
  const climateZoneParams = useParamsStore((s) => s.climateZoneParams);
  const setClimateZoneParams = useParamsStore((s) => s.setClimateZoneParams);

  return (
    <fieldset className="param-group" data-testid="param-group-climate-zone">
      <legend>気候帯 調整（Step 7）</legend>
      <p className="param-note">
        Pasta 標準 Köppen-Geiger 系統で分類。降水ラベル → 月別降水量
        （mm/月）の対応表が分類しきい値に直接効きます。
      </p>
      <Slider
        id="climate-zone-precip-dry"
        label="降水ラベル『乾』の月降水量"
        unit="mm/月"
        min={0}
        max={60}
        step={1}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.dry}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.dry}
        helpText="Step 6 の dry ラベルを Step 7 で何 mm/月として量化するか（既定 10 mm/月）。Köppen B 群の判定に直接効く。"
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { dry: v } })}
      />
      <Slider
        id="climate-zone-precip-normal"
        label="降水ラベル『普通』の月降水量"
        unit="mm/月"
        min={20}
        max={150}
        step={5}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.normal}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.normal}
        helpText="normal ラベルの月降水量（既定 60 mm/月）。Köppen Cf/Df 系の通常雨量レベル。"
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { normal: v } })}
      />
      <Slider
        id="climate-zone-precip-wet"
        label="降水ラベル『湿』の月降水量"
        unit="mm/月"
        min={60}
        max={300}
        step={10}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.wet}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.wet}
        helpText="wet ラベルの月降水量（既定 120 mm/月）。Köppen Am の湿潤閾値に近い。"
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { wet: v } })}
      />
      <Slider
        id="climate-zone-precip-verywet"
        label="降水ラベル『多湿』の月降水量"
        unit="mm/月"
        min={120}
        max={500}
        step={10}
        precision={0}
        value={climateZoneParams.precipitationMmByLabel.very_wet}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.precipitationMmByLabel.very_wet}
        helpText="very_wet ラベルの月降水量（既定 240 mm/月）。Köppen Af 熱帯雨林の典型値。"
        onChange={(v) => setClimateZoneParams({ precipitationMmByLabel: { very_wet: v } })}
      />
      <div className="param-toggle">
        <span className="param-toggle__label">乾燥帯 Hot/Cold 判定</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              climateZoneParams.aridHotColdCriterion === 'monthly'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridHotColdCriterion: 'monthly' })}
            data-testid="climate-zone-criterion-monthly"
          >
            月平均（標準）
          </button>
          <button
            type="button"
            className={
              climateZoneParams.aridHotColdCriterion === 'annual'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridHotColdCriterion: 'annual' })}
            data-testid="climate-zone-criterion-annual"
          >
            年平均 ≥ 18°C
          </button>
        </div>
      </div>
      <div className="param-toggle">
        <span className="param-toggle__label">B → D 振り戻し（[§4.1.7]）</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            className={
              climateZoneParams.aridReclassToDEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridReclassToDEnabled: true })}
            data-testid="climate-zone-reclass-on"
          >
            有効
          </button>
          <button
            type="button"
            className={
              !climateZoneParams.aridReclassToDEnabled
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => setClimateZoneParams({ aridReclassToDEnabled: false })}
            data-testid="climate-zone-reclass-off"
          >
            無効
          </button>
        </div>
      </div>
      <Slider
        id="climate-zone-reclass-max-temp"
        label="B → D 振り戻し 年平均気温しきい値"
        unit="°C"
        min={-5}
        max={20}
        step={0.5}
        precision={1}
        value={climateZoneParams.aridReclassToDMaxAnnualTempCelsius}
        defaultValue={DEFAULT_CLIMATE_ZONE_STEP_PARAMS.aridReclassToDMaxAnnualTempCelsius}
        helpText="年平均気温がこの値以下なら、低降水量でも乾燥扱いせず D 群（亜寒帯/大陸性）に振り戻す（既定 7°C、Worldbuilder's Log #40）。"
        onChange={(v) => setClimateZoneParams({ aridReclassToDMaxAnnualTempCelsius: v })}
      />
    </fieldset>
  );
}
