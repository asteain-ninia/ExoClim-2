// 地形ソース調整 UI（[要件定義書.md §2.1.4] / [§4.2] TerrainSource）。
// 規約:
//   - tagged union 'preset' / 'procedural' / 'custom' を切替えるトグル + 各バリアントの
//     サブフィールド調整を提供。
//   - 状態層 params store の `setTerrain` で全置換する（部分更新ではなく union のメンバー切替）。
//   - 'custom' は P4-5c 時点では未実装（[src/domain/terrain.ts] が NotImplemented を投げる）。

import { EARTH_GLOBAL_LAND_FRACTION, type TerrainSource } from '@/domain';
import { useParamsStore } from '@/store/params';
import { Slider } from './Slider';

interface PresetOption {
  readonly value: string;
  readonly label: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
  { value: 'earth', label: '地球風（Earth-like）' },
  { value: 'idealized_continent', label: '仮想大陸（経度中央寄せ）' },
  { value: 'no_land', label: '全海洋（水球）' },
];

export function TerrainSourceSelector() {
  const terrain = useParamsStore((s) => s.planet.terrain);
  const setTerrain = useParamsStore((s) => s.setTerrain);

  const switchKind = (nextKind: TerrainSource['kind']): void => {
    if (nextKind === terrain.kind) return;
    if (nextKind === 'preset') {
      setTerrain({ kind: 'preset', presetId: 'earth' });
    } else if (nextKind === 'procedural') {
      setTerrain({
        kind: 'procedural',
        seed: 0,
        landFraction: EARTH_GLOBAL_LAND_FRACTION,
      });
    }
    // 'custom' はトグルから選べない（未実装）。UI でも表示しない。
  };

  return (
    <fieldset className="param-group" data-testid="param-group-terrain">
      <legend>地形ソース</legend>
      <div className="param-toggle" role="radiogroup" aria-label="地形種別">
        <span className="param-toggle__label">種別</span>
        <div className="param-toggle__buttons">
          <button
            type="button"
            role="radio"
            aria-checked={terrain.kind === 'preset'}
            className={
              terrain.kind === 'preset'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => switchKind('preset')}
            data-testid="terrain-kind-preset"
          >
            プリセット
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={terrain.kind === 'procedural'}
            className={
              terrain.kind === 'procedural'
                ? 'param-toggle__btn param-toggle__btn--active'
                : 'param-toggle__btn'
            }
            onClick={() => switchKind('procedural')}
            data-testid="terrain-kind-procedural"
          >
            手続き生成
          </button>
        </div>
      </div>

      {terrain.kind === 'preset' && (
        <div className="terrain-preset-row">
          <label htmlFor="terrain-preset-id" className="terrain-preset-row__label">
            プリセット選択
          </label>
          <select
            id="terrain-preset-id"
            data-testid="terrain-preset-id"
            className="terrain-preset-row__select"
            value={terrain.presetId}
            onChange={(e) => setTerrain({ kind: 'preset', presetId: e.target.value })}
          >
            {PRESET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {terrain.kind === 'procedural' && (
        <>
          <Slider
            id="terrain-seed"
            label="乱数シード"
            min={0}
            max={9999}
            step={1}
            precision={0}
            value={terrain.seed}
            defaultValue={0}
            onChange={(v) =>
              setTerrain({ kind: 'procedural', seed: v, landFraction: terrain.landFraction })
            }
          />
          <Slider
            id="terrain-land-fraction"
            label="陸地割合"
            min={0}
            max={1}
            step={0.01}
            precision={2}
            value={terrain.landFraction}
            defaultValue={EARTH_GLOBAL_LAND_FRACTION}
            onChange={(v) =>
              setTerrain({ kind: 'procedural', seed: terrain.seed, landFraction: v })
            }
          />
        </>
      )}

      {terrain.kind === 'custom' && (
        <p className="param-note">
          カスタム地形は未実装です（Phase 4 後半の §2.4.1 マップインポートで対応予定）。
        </p>
      )}
    </fieldset>
  );
}
