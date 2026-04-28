// 構造的同値性（deep equality）の判定。
// 用途: ワーカー層 pipeline のキャッシュキー比較（[技術方針.md §2.2.3]）。
// 規約:
//   - キャッシュキーは TIn の構造的同値性で判定する。
//   - 浮動小数点数は Object.is に従い厳密一致（[技術方針.md §2.2.3] / [開発ガイド.md §6.1.1]）。
//   - NaN === NaN を真と扱う（Object.is 準拠）。
//   - -0 と +0 を区別する（同上、[開発ガイド.md §6.1.1] と整合）。
// 制約: 循環参照を含む構造には対応しない。ドメイン層の入力は循環なしと仮定する。

/**
 * 二つの値が構造的に等価であれば true。
 * 対応する型: プリミティブ（string / number / boolean / null / undefined / bigint / symbol）、
 *   配列、プレーンオブジェクト。
 *
 * 浮動小数点数の比較に Object.is を使うため、`-0` と `+0` は別物、`NaN` 同士は等価と扱う。
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray) {
    const arrA = a as readonly unknown[];
    const arrB = b as readonly unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
    if (!deepEqual(objA[k], objB[k])) return false;
  }
  return true;
}
