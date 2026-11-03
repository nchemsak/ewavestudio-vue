// src/audio/ticker.ts
// Calls `onTick` every `intervalMs` while running. Drives the sequencer's lookahead scheduler.
//
// The timer runs in a tiny Web Worker because browsers pause requestAnimationFrame and
// throttle main-thread timers in background tabs, which used to stop playback whenever the
// tab was hidden. Worker timers keep running. If a worker can't be created (for example
// a Content-Security-Policy that blocks blob: workers), it falls back to setInterval.

export type Ticker = {
	start(): void;
	stop(): void;
	dispose(): void;
};

const WORKER_SOURCE = `
let id = null;
self.onmessage = (e) => {
	const msg = e.data || {};
	if (id !== null) { clearInterval(id); id = null; }
	if (msg.type === 'start') id = setInterval(() => self.postMessage(0), msg.intervalMs);
};
`;

export function createTicker(onTick: () => void, intervalMs = 25): Ticker {
	let running = false;
	let worker: Worker | null = null;
	let workerUrl: string | null = null;
	let fallbackId: number | null = null;

	function startFallback() {
		if (fallbackId === null) fallbackId = window.setInterval(onTick, intervalMs);
	}

	function dropWorker() {
		worker?.terminate();
		worker = null;
		if (workerUrl) URL.revokeObjectURL(workerUrl);
		workerUrl = null;
	}

	try {
		workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
		worker = new Worker(workerUrl);
		worker.onmessage = () => { if (running) onTick(); };
		worker.onerror = () => {
			dropWorker();
			if (running) startFallback();
		};
	} catch {
		dropWorker();
	}

	function start() {
		if (running) return;
		running = true;
		if (worker) worker.postMessage({ type: 'start', intervalMs });
		else startFallback();
	}

	function stop() {
		running = false;
		worker?.postMessage({ type: 'stop' });
		if (fallbackId !== null) {
			clearInterval(fallbackId);
			fallbackId = null;
		}
	}

	function dispose() {
		stop();
		dropWorker();
	}

	return { start, stop, dispose };
}
