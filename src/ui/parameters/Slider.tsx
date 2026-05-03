// 物理パラメータ用の汎用スライダーコンポーネント。
// 仕様: [要件定義書.md §2.3.6] パラメータ調整 UI / [§3.4] 操作様式（連続値）。
// 規約: HTML range input をラップし、ラベル・現在値・地球プリセット復帰ボタンを併設する。

interface SliderProps {
  /** input 要素の id（ラベルとの関連付けと data-testid の組成に使う）。 */
  readonly id: string;
  readonly label: string;
  /** 単位記号（例: "AU"、"°"、"日"）。空文字なら表示しない。 */
  readonly unit?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** 表示の小数点以下桁数。 */
  readonly precision?: number;
  /**
   * 「地球プリセットに戻す」ボタンの参照値。指定なしなら復帰ボタンを表示しない。
   * 例: `EARTH_ORBITAL_PARAMS.eccentricity` を渡す。
   */
  readonly defaultValue?: number;
  /**
   * ヘルプ説明文（[現状.md §6 U11]、P4-35）。
   * 指定されていれば label 横に `?` アイコンを出し、ホバー/フォーカスで
   * ネイティブツールチップ表示。spec 引用や Pasta 出典を入れる用途。
   */
  readonly helpText?: string;
  readonly onChange: (value: number) => void;
}

export function Slider({
  id,
  label,
  unit = '',
  min,
  max,
  step,
  value,
  precision = 2,
  defaultValue,
  helpText,
  onChange,
}: SliderProps) {
  const formattedValue = value.toFixed(precision);
  return (
    <div className="slider">
      <label htmlFor={id} className="slider__label-row">
        <span className="slider__label">
          {label}
          {helpText && (
            <span
              className="slider__help"
              role="img"
              aria-label={`ヘルプ: ${helpText}`}
              tabIndex={0}
              title={helpText}
              data-testid={`slider-${id}-help`}
            >
              ?
            </span>
          )}
        </span>
        <span className="slider__value">
          {formattedValue}
          {unit && <span className="slider__unit">{unit}</span>}
        </span>
      </label>
      <div className="slider__controls">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          data-testid={`slider-${id}`}
          className="slider__input"
        />
        {defaultValue !== undefined && (
          <button
            type="button"
            className="slider__reset"
            onClick={() => onChange(defaultValue)}
            aria-label={`${label}を地球プリセット (${defaultValue.toFixed(precision)}${unit}) に戻す`}
            data-testid={`slider-${id}-reset`}
            title={`地球プリセット: ${defaultValue.toFixed(precision)}${unit}`}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}
