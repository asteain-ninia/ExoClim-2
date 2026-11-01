// node 環境（Vitest）用の偽 Worker。createPipelineBridgeOverWorker のプロトコル検証に使う。
import type {
  WorkerInboundMessage,
  WorkerLike,
  WorkerOutboundMessage,
} from '@/worker/bridge';

// 各イベント型のリスナーを一括で受けるため、引数は never（反変）で受けて呼び出し時に unknown へ広げる。
type Listener = (event: never) => void;

export class FakeWorker implements WorkerLike {
  readonly sent: WorkerInboundMessage[] = [];
  terminated = false;
  /** postMessage 時に呼ばれるフック（例外を投げれば DataCloneError 相当）。 */
  onPost: ((message: WorkerInboundMessage) => void) | null = null;
  private readonly listeners = new Map<string, Listener[]>();

  postMessage(message: WorkerInboundMessage): void {
    this.onPost?.(message);
    this.sent.push(message);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Worker → bridge の応答を配送する。 */
  respond(response: WorkerOutboundMessage): void {
    this.emit('message', { data: response });
  }

  /** Worker の error イベントを発火する。 */
  emitError(message: string, filename = '', lineno = 0): void {
    this.emit('error', { message, filename, lineno });
  }

  /** Worker の messageerror イベントを発火する。 */
  emitMessageError(): void {
    this.emit('messageerror', { data: null });
  }

  /** 直近に送られた run 要求の id。 */
  lastRunId(): number {
    for (let k = this.sent.length - 1; k >= 0; k--) {
      const m = this.sent[k]!;
      if (m.type === 'run') return m.id;
    }
    throw new Error('run 要求がまだ送られていない');
  }

  private emit(type: string, event: unknown): void {
    for (const l of this.listeners.get(type) ?? []) (l as (e: unknown) => void)(event);
  }
}
