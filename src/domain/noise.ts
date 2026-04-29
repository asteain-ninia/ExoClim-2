// 球面上の値ノイズ（fBm / ridge）。地形生成の連続性ベース。
// 出典: 旧 ExoClim `services/utils/noise.ts` から移植（[実装済み.md §旧 ExoClim] 参照）。
// 規約:
//   - 純粋関数。同入力（座標 + seed）で同出力。
//   - 球面座標を 3D 単位ベクトルとして受け取り、極でも継続性を保つ（緯度経度の特異点回避）。
//   - 出力範囲は概ね [0, 1)（fbmSphere）または [0, 1]（ridgeSphere）。

const HASH_X_COEF = 127.1;
const HASH_Y_COEF = 311.7;
const HASH_Z_COEF = 74.7;
const HASH_SCALE = 43758.5453123;

/**
 * 3D 入力 + seed を [0, 1) のスカラーにハッシュする。
 * Math.sin の小数部を取る古典的手法。決定論的で高速。
 */
export function hash33(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * HASH_X_COEF + y * HASH_Y_COEF + z * HASH_Z_COEF + seed) * HASH_SCALE;
  return n - Math.floor(n);
}

/**
 * 3D 値ノイズ（trilinear 補間）。
 * 各格子点で hash33、立方体内を smoothstep（3t²-2t³）で補間する。
 */
export function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);

  const n000 = hash33(ix, iy, iz, seed);
  const n100 = hash33(ix + 1, iy, iz, seed);
  const n010 = hash33(ix, iy + 1, iz, seed);
  const n110 = hash33(ix + 1, iy + 1, iz, seed);
  const n001 = hash33(ix, iy, iz + 1, seed);
  const n101 = hash33(ix + 1, iy, iz + 1, seed);
  const n011 = hash33(ix, iy + 1, iz + 1, seed);
  const n111 = hash33(ix + 1, iy + 1, iz + 1, seed);

  const r1 = n000 * (1 - u) + n100 * u;
  const r2 = n010 * (1 - u) + n110 * u;
  const r3 = n001 * (1 - u) + n101 * u;
  const r4 = n011 * (1 - u) + n111 * u;
  const r5 = r1 * (1 - v) + r2 * v;
  const r6 = r3 * (1 - v) + r4 * v;
  return r5 * (1 - w) + r6 * w;
}

const FBM_BASE_SCALE = 2.0;

/**
 * 球面 fBm（複数オクターブの値ノイズの加重和）。
 * 連続的な地形（大陸の形）の生成に使う。
 * 入力 (nx, ny, nz) は単位ベクトル想定。
 */
export function fbmSphere(
  nx: number,
  ny: number,
  nz: number,
  octaves: number,
  seed: number,
): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise3D(nx * freq * FBM_BASE_SCALE, ny * freq * FBM_BASE_SCALE, nz * freq * FBM_BASE_SCALE, seed);
    norm += amp;
    freq *= 2.0;
    amp *= 0.5;
  }
  return val / norm;
}

/**
 * 球面 ridge ノイズ（fBm の絶対値を反転して鋭い尾根を作る）。
 * 山脈の生成に使う。前段の値で次段を変調する自己相関を持つ。
 */
export function ridgeSphere(
  nx: number,
  ny: number,
  nz: number,
  octaves: number,
  seed: number,
): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let prev = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let n = noise3D(nx * freq * FBM_BASE_SCALE, ny * freq * FBM_BASE_SCALE, nz * freq * FBM_BASE_SCALE, seed + i * 13.0);
    n = 1.0 - Math.abs(2.0 * n - 1.0);
    n = n * n;
    val += n * amp * prev;
    norm += amp;
    prev = n;
    freq *= 2.0;
    amp *= 0.5;
  }
  return val / norm;
}
