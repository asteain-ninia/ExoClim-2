// マウスオーバー時のセル情報表示コンポーネント（[要件定義書.md §2.3.5] デバッグビューの簡易版）。
// 規約: results store のみを購読し、計算層・ワーカー層には依存しない（[技術方針.md §2.1.5]）。
//
// MapCanvas が pointermove ハンドラ内で `useUIStore.getState().setHoveredCell(...)` を呼び、
// その内容を本コンポーネントが描画する。Hover 中のセルは「カーソル直下の grid index」で
// 一意に特定でき、月別データ（温度・降水）は currentSeason に同期して切替えて表示する。

import { useMemo } from 'react';
import { classificationFromCorrection } from '@/sim';
import { useResultsStore } from '@/store/results';
import { useUIStore, type SeasonPhaseView } from '@/store/ui';

/** 月別量の表示用に「年平均か月別か」を判定し、文字列ラベルを返す。 */
function seasonLabel(currentSeason: SeasonPhaseView): string {
  if (currentSeason === 'annual') return '年平均';
  return `${currentSeason + 1} 月`;
}

/** 月別 GridMap（GridMap<T> で T が number）から、currentSeason に応じた値を取り出す。 */
function pickMonthlyNumber(
  monthly: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>,
  currentSeason: SeasonPhaseView,
  i: number,
  j: number,
): number | null {
  if (currentSeason === 'annual') {
    let sum = 0;
    let count = 0;
    for (const month of monthly) {
      const v = month[i]?.[j];
      if (v !== undefined && Number.isFinite(v)) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  }
  const v = monthly[currentSeason]?.[i]?.[j];
  return v !== undefined && Number.isFinite(v) ? v : null;
}

export function CellInspector() {
  const hoveredCell = useUIStore((s) => s.hoveredCell);
  const currentSeason = useUIStore((s) => s.currentSeason);
  const grid = useResultsStore((s) => s.grid);
  const itcz = useResultsStore((s) => s.itcz);
  const windBelt = useResultsStore((s) => s.windBelt);
  const oceanCurrent = useResultsStore((s) => s.oceanCurrent);
  const airflow = useResultsStore((s) => s.airflow);
  const temperature = useResultsStore((s) => s.temperature);
  const precipitation = useResultsStore((s) => s.precipitation);
  const climateZone = useResultsStore((s) => s.climateZone);

  const info = useMemo(() => {
    if (!hoveredCell || !grid) return null;
    const { latIndex: i, lonIndex: j } = hoveredCell;
    const cell = grid.cells[i]?.[j];
    if (!cell) return null;

    const tempC = temperature
      ? pickMonthlyNumber(temperature.monthlyTemperatureCelsius, currentSeason, i, j)
      : null;
    const annualMeanT = temperature?.annualMeanTemperatureCelsius[i]?.[j] ?? null;
    const summerMaxT = temperature?.summerMaxTemperatureCelsius[i]?.[j] ?? null;
    const winterMinT = temperature?.winterMinTemperatureCelsius[i]?.[j] ?? null;

    const precipLabel =
      precipitation && currentSeason !== 'annual'
        ? precipitation.monthlyPrecipitationLabels[currentSeason]?.[i]?.[j] ?? null
        : null;

    // 年平均は最頻ラベル
    const annualPrecipLabel = precipitation
      ? (() => {
          const counts: Record<string, number> = { dry: 0, normal: 0, wet: 0, very_wet: 0 };
          for (const m of precipitation.monthlyPrecipitationLabels) {
            const v = m[i]?.[j];
            if (v) counts[v] = (counts[v] ?? 0) + 1;
          }
          let best: string | null = null;
          let bestCount = -1;
          for (const k of Object.keys(counts)) {
            const v = counts[k] ?? 0;
            if (v > bestCount) {
              best = k;
              bestCount = v;
            }
          }
          return best;
        })()
      : null;

    const wind = airflow
      ? currentSeason === 'annual'
        ? null
        : airflow.monthlyWindField[currentSeason]?.[i]?.[j] ?? null
      : null;

    const pressureAnomaly = airflow
      ? pickMonthlyNumber(airflow.monthlyPressureAnomalyHpa, currentSeason, i, j)
      : null;

    const oceanCorrection =
      oceanCurrent && !cell.isLand
        ? oceanCurrent.monthlyCoastalTemperatureCorrectionCelsius[0]?.[i]?.[j] ?? 0
        : 0;
    const oceanClass = oceanCorrection !== 0 ? classificationFromCorrection(oceanCorrection) : null;

    const itczBand =
      itcz && currentSeason !== 'annual'
        ? itcz.monthlyBands[currentSeason]?.[j] ?? null
        : null;
    const annualItczCenter = itcz?.annualMeanCenterLatitudeDeg[j] ?? null;

    const monsoonMask = windBelt
      ? currentSeason !== 'annual'
        ? windBelt.monthlyMonsoonMask[currentSeason]?.[i]?.[j] === true
        : false
      : false;

    const zoneCode = climateZone?.zoneCodes[i]?.[j] ?? null;

    return {
      cell,
      i,
      j,
      tempC,
      annualMeanT,
      summerMaxT,
      winterMinT,
      precipLabel,
      annualPrecipLabel,
      wind,
      pressureAnomaly,
      oceanCorrection,
      oceanClass,
      itczBand,
      annualItczCenter,
      monsoonMask,
      zoneCode,
    };
  }, [
    hoveredCell,
    grid,
    currentSeason,
    itcz,
    windBelt,
    oceanCurrent,
    airflow,
    temperature,
    precipitation,
    climateZone,
  ]);

  if (!info) {
    return (
      <fieldset className="param-group cell-inspector" data-testid="cell-inspector">
        <legend>セル情報（マウスオーバー）</legend>
        <p className="cell-inspector__empty">マップ上にカーソルを置くと表示されます。</p>
      </fieldset>
    );
  }

  const { cell } = info;
  const fmt = (v: number | null, suffix = '', precision = 1): string =>
    v === null ? '—' : `${v.toFixed(precision)}${suffix}`;

  return (
    <fieldset className="param-group cell-inspector" data-testid="cell-inspector">
      <legend>セル情報（{seasonLabel(currentSeason)}）</legend>
      <dl className="cell-inspector__list">
        <dt>位置</dt>
        <dd data-testid="cell-inspector-position">
          {cell.latitudeDeg.toFixed(2)}° lat / {cell.longitudeDeg.toFixed(2)}° lon
        </dd>

        <dt>地形</dt>
        <dd>
          {cell.isLand ? '陸地' : '海洋'} / {fmt(cell.elevationMeters, ' m', 0)}
          {cell.continentId && ` (${cell.continentId})`}
        </dd>

        <dt>気温（{seasonLabel(currentSeason)}）</dt>
        <dd data-testid="cell-inspector-temperature">{fmt(info.tempC, ' °C')}</dd>

        <dt>気温（年平均 / 夏 / 冬）</dt>
        <dd>
          {fmt(info.annualMeanT, ' °C')} / {fmt(info.summerMaxT, ' °C')} /{' '}
          {fmt(info.winterMinT, ' °C')}
        </dd>

        <dt>降水ラベル</dt>
        <dd data-testid="cell-inspector-precipitation">
          {currentSeason === 'annual'
            ? `${info.annualPrecipLabel ?? '—'}（最頻）`
            : info.precipLabel ?? '—'}
        </dd>

        <dt>風（{seasonLabel(currentSeason)}）</dt>
        <dd>
          {info.wind
            ? `u=${info.wind.uMps.toFixed(2)} / v=${info.wind.vMps.toFixed(2)} m/s`
            : currentSeason === 'annual'
              ? '（月選択で表示）'
              : '—'}
        </dd>

        <dt>気圧 anomaly</dt>
        <dd>{fmt(info.pressureAnomaly, ' hPa', 2)}</dd>

        <dt>海流</dt>
        <dd>
          {cell.isLand
            ? '（陸地）'
            : info.oceanClass
              ? `${info.oceanClass}（補正 ${info.oceanCorrection.toFixed(1)} °C）`
              : '中立'}
        </dd>

        <dt>ITCZ 中心 / 影響帯</dt>
        <dd>
          {info.itczBand
            ? `中心 ${info.itczBand.centerLatitudeDeg.toFixed(1)}°（${info.itczBand.southBoundLatitudeDeg.toFixed(0)}° 〜 ${info.itczBand.northBoundLatitudeDeg.toFixed(0)}°）`
            : info.annualItczCenter !== null
              ? `年平均中心 ${info.annualItczCenter.toFixed(1)}°`
              : '—'}
        </dd>

        <dt>モンスーン領域</dt>
        <dd>{info.monsoonMask ? '○（月選択時）' : '×'}</dd>

        <dt>気候帯（Köppen）</dt>
        <dd data-testid="cell-inspector-climate-zone">{info.zoneCode ?? '—'}</dd>
      </dl>
    </fieldset>
  );
}
