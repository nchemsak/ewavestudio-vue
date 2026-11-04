import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTicker } from './ticker';

// A stand-in for the browser's Worker that records messages and lets the test fire events
class FakeWorker {
	static last: FakeWorker | null = null;
	posted: unknown[] = [];
	terminated = false;
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: (() => void) | null = null;
	constructor() { FakeWorker.last = this; }
	postMessage(msg: unknown) { this.posted.push(msg); }
	terminate() { this.terminated = true; }
}

beforeEach(() => {
	vi.stubGlobal('window', globalThis); // the fallback timer uses window.setInterval
	FakeWorker.last = null;
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createTicker', () => {
	it('runs from the worker, and ignores a tick that arrives after stop()', () => {
		vi.stubGlobal('Worker', FakeWorker);
		const onTick = vi.fn();
		const ticker = createTicker(onTick, 25);
		const worker = FakeWorker.last!;

		ticker.start();
		expect(worker.posted).toEqual([{ type: 'start', intervalMs: 25 }]);
		worker.onmessage!({ data: 0 });
		worker.onmessage!({ data: 0 });
		expect(onTick).toHaveBeenCalledTimes(2);

		ticker.stop();
		expect(worker.posted.at(-1)).toEqual({ type: 'stop' });
		worker.onmessage!({ data: 0 }); // already in flight when stop() ran
		expect(onTick).toHaveBeenCalledTimes(2);

		ticker.dispose();
		expect(worker.terminated).toBe(true);
	});

	it('falls back to a timer when a worker cannot be created', () => {
		vi.useFakeTimers();
		vi.stubGlobal('Worker', class { constructor() { throw new Error('blocked by CSP'); } });
		const onTick = vi.fn();
		const ticker = createTicker(onTick, 25);

		ticker.start();
		vi.advanceTimersByTime(100);
		expect(onTick).toHaveBeenCalledTimes(4);

		ticker.start(); // a second start() must not double the rate
		vi.advanceTimersByTime(100);
		expect(onTick).toHaveBeenCalledTimes(8);

		ticker.stop();
		vi.advanceTimersByTime(100);
		expect(onTick).toHaveBeenCalledTimes(8);
	});

	it('switches to the timer if the worker fails to load while running', () => {
		vi.useFakeTimers();
		vi.stubGlobal('Worker', FakeWorker);
		const onTick = vi.fn();
		const ticker = createTicker(onTick, 25);
		const worker = FakeWorker.last!;

		ticker.start();
		worker.onerror!();
		expect(worker.terminated).toBe(true);
		vi.advanceTimersByTime(100);
		expect(onTick).toHaveBeenCalledTimes(4);
		ticker.dispose();
	});
});
