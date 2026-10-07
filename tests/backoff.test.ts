import { describe, expect, it, vi } from 'vitest';
import { IpcBackoff } from '../src/platform/backoff';

describe('native IPC outages', () => {
  it('backs off repeated failures, reports once and resumes immediately after recovery', async () => {
    let now = 0;
    const gate = new IpcBackoff(() => now), failure = vi.fn(), recovered = vi.fn();
    const task = vi.fn().mockRejectedValue(new Error('window unavailable'));
    await gate.run(task, failure, recovered);
    for (const delay of [500, 1000, 2000, 4000, 8000, 8000]) {
      const calls = task.mock.calls.length;
      now += delay - 1;
      await gate.run(task, failure, recovered); expect(task).toHaveBeenCalledTimes(calls);
      now++;
      await gate.run(task, failure, recovered); expect(task).toHaveBeenCalledTimes(calls + 1);
    }
    expect(failure).toHaveBeenCalledTimes(1); expect(recovered).not.toHaveBeenCalled();
    now += 8000; task.mockResolvedValue(undefined);
    await gate.run(task, failure, recovered); expect(recovered).toHaveBeenCalledTimes(1);
    const count = task.mock.calls.length;
    await gate.run(task, failure, recovered); expect(task).toHaveBeenCalledTimes(count + 1);
    task.mockRejectedValue(new Error('second outage'));
    await gate.run(task, failure, recovered); expect(failure).toHaveBeenCalledTimes(2);
  });
  it('allows only one pending call and ignores completions after switching characters', async () => {
    let reject!: (error: Error) => void;
    const task = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    const gate = new IpcBackoff(), failure = vi.fn(), recovered = vi.fn();
    const pending = gate.run(task, failure, recovered);
    await gate.run(task, failure, recovered); expect(task).toHaveBeenCalledTimes(1);
    gate.dispose(); reject(new Error('old character')); await pending;
    await gate.run(task, failure, recovered);
    expect(task).toHaveBeenCalledTimes(1); expect(failure).not.toHaveBeenCalled(); expect(recovered).not.toHaveBeenCalled();
  });
});
