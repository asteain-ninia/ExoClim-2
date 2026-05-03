// 現在の Canvas を PNG ファイルとしてダウンロードするボタン。
// 仕様: [現状.md §6 U17] スクリーンショット出力。
// 規約:
//   - Canvas DOM 要素を data-testid="map-canvas" で取得
//   - Blob 経由でダウンロード（toBlob で非同期、メモリ効率も良い）
//   - ファイル名: exoclim-YYYYMMDD-HHMMSS.png

const FILENAME_PREFIX = 'exoclim';

function formatTimestamp(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function ExportPngButton() {
  const handleClick = (): void => {
    const canvas = document.querySelector(
      '[data-testid="map-canvas"]',
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      console.warn('[ExportPngButton] map-canvas が見つかりませんでした');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${FILENAME_PREFIX}-${formatTimestamp(new Date())}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Blob URL を解放（次フレームで cleanup、即時 revoke だと chrome の download dialog で blob が消える）
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <button
      type="button"
      className="app__export-btn"
      onClick={handleClick}
      data-testid="app-export-png-button"
      title="現在の地図を PNG ファイルとしてダウンロード"
    >
      ⤓ PNG
    </button>
  );
}
