// 惑星本体に関する利用者入力 UI（[要件定義書.md §2.1.2] / [§4.2] PlanetBodyParams）。
// 規約: ドメイン層の `EARTH_BODY_PARAMS` を地球プリセット復帰値として使う。
//   状態層 params store の `setBody` で部分更新する。
//
// 注: rotationDirection は離散値（順行 / 逆行）のため Slider ではなく Toggle で扱う
//   （[要件定義書.md §3.4] 操作様式）。

import { EARTH_BODY_PARAMS, type RotationDirection } from '@/domain';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

interface RotationDirectionToggleProps {
  readonly value: RotationDirection;
  readonly onChange: (value: RotationDirection) => void;
}

function RotationDirectionToggle({ value, onChange }: RotationDirectionToggleProps) {
  return (
    <div className="param-toggle" role="radiogroup" aria-label="自転方向">
      <span className="param-toggle__label">自転方向</span>
      <div className="param-toggle__buttons">
        <button
          type="button"
          role="radio"
          aria-checked={value === 'prograde'}
          className={
            value === 'prograde'
              ? 'param-toggle__btn param-toggle__btn--active'
              : 'param-toggle__btn'
          }
          onClick={() => onChange('prograde')}
          data-testid="body-rotation-prograde"
        >
          順行
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'retrograde'}
          className={
            value === 'retrograde'
              ? 'param-toggle__btn param-toggle__btn--active'
              : 'param-toggle__btn'
          }
          onClick={() => onChange('retrograde')}
          data-testid="body-rotation-retrograde"
        >
          逆行
        </button>
      </div>
    </div>
  );
}

export function PlanetBodySliders() {
  const body = useParamsStore((s) => s.planet.body);
  const setBody = useParamsStore((s) => s.setBody);

  return (
    <fieldset className="param-group" data-testid="param-group-body">
      <legend>惑星本体</legend>
      <Slider
        id="body-radius"
        label="半径"
        unit="km"
        min={1000}
        max={20000}
        step={10}
        precision={0}
        value={body.radiusKm}
        defaultValue={EARTH_BODY_PARAMS.radiusKm}
        helpText="惑星半径（地球 = 6,371 km）。Hadley セル境界のスケールに影響。"
        onChange={(v) => setBody({ radiusKm: v })}
      />
      <Slider
        id="body-rotation-period"
        label="自転周期"
        unit="時間"
        min={1}
        max={500}
        step={0.1}
        precision={1}
        value={body.rotationPeriodHours}
        defaultValue={EARTH_BODY_PARAMS.rotationPeriodHours}
        helpText="1 自転にかかる時間（地球 = 24 時間）。短いとコリオリ効果↑（風帯・海流が複雑化）、長いと弱化。"
        onChange={(v) => setBody({ rotationPeriodHours: v })}
      />
      <Slider
        id="body-axial-tilt"
        label="地軸傾斜"
        unit="°"
        min={0}
        max={90}
        step={0.5}
        precision={1}
        value={body.axialTiltDeg}
        defaultValue={EARTH_BODY_PARAMS.axialTiltDeg}
        helpText="自転軸の公転面に対する傾き（地球 = 23.5°）。0 で季節なし、90 で極地が交互に長日/長夜。ITCZ の南北移動量を直接決める。"
        onChange={(v) => setBody({ axialTiltDeg: v })}
      />
      <Slider
        id="body-gravity"
        label="表面重力"
        unit="m/s²"
        min={0.1}
        max={50}
        step={0.1}
        precision={1}
        value={body.surfaceGravityMps2}
        defaultValue={EARTH_BODY_PARAMS.surfaceGravityMps2}
        helpText="表面の重力加速度（地球 = 9.81 m/s²）。大気圧スケール高さに影響（弱重力 → 大気層が厚い）。"
        onChange={(v) => setBody({ surfaceGravityMps2: v })}
      />
      <RotationDirectionToggle
        value={body.rotationDirection}
        onChange={(v) => setBody({ rotationDirection: v })}
      />
    </fieldset>
  );
}
