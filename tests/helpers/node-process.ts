import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { childEnvironment } from './environment.js';

type ExitInfo = { code: number | null; signal: NodeJS.Signals | null };
type Message = Record<string, unknown>;

export class ManagedNode {
  private readonly events = new EventEmitter();
  private readonly child;
  private readonly messages: Message[] = [];
  private stdout = '';
  private stderr = '';
  private failure: Error | undefined;
  private exitInfo: ExitInfo | undefined;
  private nextRequest = 0;
  private readonly closed: Promise<ExitInfo>;

  constructor(args: string[], readonly cwd: string, environment: NodeJS.ProcessEnv, ipc: boolean, inherited: readonly number[] = []) {
    this.child = spawn(process.execPath, args, {
      cwd, env: childEnvironment(environment), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...inherited, ...(ipc ? ['ipc' as const] : [])],
    });
    const stdout = this.child.stdout;
    const stderr = this.child.stderr;
    if (!stdout || !stderr) throw new Error('Fixture 缺少輸出 pipe');
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');
    stdout.on('data', (chunk: string) => { this.stdout += chunk; this.updated(); });
    stderr.on('data', (chunk: string) => { this.stderr += chunk; this.updated(); });
    this.child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && !Array.isArray(message)) this.messages.push(message as Message);
      else this.failure = new Error('無效 fixture IPC 回應');
      this.updated();
    });
    this.child.once('error', () => { this.failure = new Error('無法啟動 fixture 子程序'); this.updated(); });
    this.closed = new Promise((resolve) => {
      this.child.once('close', (code, signal) => {
        this.exitInfo = { code, signal };
        resolve(this.exitInfo);
        this.events.emit('updated');
      });
    });
  }

  private updated(): void {
    if (this.stdout.length + this.stderr.length > 65_536 || this.messages.length > 256) {
      this.failure = new Error('Fixture 子程序輸出超過上限');
      this.child.kill('SIGKILL');
    }
    this.events.emit('updated');
  }

  waitFor<T>(read: () => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Fixture 等待超過期限')), 8000);
      const finish = (error?: Error, value?: T) => {
        clearTimeout(timer);
        this.events.off('updated', check);
        if (error) reject(error);
        else if (value !== undefined) resolve(value);
      };
      const check = () => {
        try {
          if (this.failure) { finish(this.failure); return; }
          const value = read();
          if (value !== undefined) finish(undefined, value);
          else if (this.exitInfo) finish(new Error('Fixture 在預期回應前退出'));
        } catch { finish(new Error('無法讀取 fixture 狀態')); }
      };
      this.events.on('updated', check);
      check();
    });
  }

  waitForMessage(predicate: (message: Message) => boolean): Promise<Message> {
    return this.waitFor(() => {
      const index = this.messages.findIndex(predicate);
      return index < 0 ? undefined : this.messages.splice(index, 1)[0];
    });
  }

  request(action: 'status' | 'stop', signal: 'SIGINT' | 'SIGTERM' = 'SIGTERM'): Promise<Message> {
    const id = ++this.nextRequest;
    this.child.send({ action, signal, id }, (error) => {
      if (error) { this.failure = new Error('Fixture IPC 已關閉'); this.updated(); }
    });
    return this.waitForMessage((message) => message.type === 'reply' && message.id === id);
  }

  get pid() { return this.child.pid; }
  get hasExited() { return this.exitInfo !== undefined; }

  waitForExit(): Promise<ExitInfo> { return this.waitFor(() => this.exitInfo); }
  output() { return { stdout: this.stdout, stderr: this.stderr }; }

  async forceStop(): Promise<void> {
    if (this.exitInfo) return;
    this.child.kill('SIGKILL'); // 僅限此物件建立的子程序，不搜尋或終止其他 PID。
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture 子程序未退出，保留目錄供檢查')), 2000);
      void this.closed.then(() => { clearTimeout(timer); resolve(); });
    });
  }
}
