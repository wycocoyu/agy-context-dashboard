// Bounded Worker thread for cold cross-session transcript scanning so the
// main sidecar isolate stays well under the 192 MiB RSS ceiling.
import { parentPort, workerData } from 'node:worker_threads';
import { InsightsScanner } from './insights.mjs';

const scanner = new InsightsScanner({
  brainRoot: workerData.brainRoot,
  cacheDir: workerData.cacheDir,
  timeZone: workerData.timeZone,
  useWorker: false,
});

try {
  const result = await scanner.scan({ force: workerData.force === true });
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error?.message || 'Insights scan failed' });
}
