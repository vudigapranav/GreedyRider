import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultExecutable = fileURLToPath(new URL('../build/rider_assignment', import.meta.url));
export const limits = { maxPerGroup: 8, coordinateMin: -1000, coordinateMax: 1000, maxBodyBytes: 65536 };

// Boundary validation only. All assignments, traces, totals, and comparison
// calculations come from C++; none are implemented in JavaScript.
export function validatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Request must be a JSON object.';
  for (const key of ['riders', 'orders']) {
    if (!Array.isArray(value[key])) return `${key} must be an array.`;
    if (value[key].length > limits.maxPerGroup) return `${key} permits at most 8 members.`;
    const ids = new Set();
    for (const [index, item] of value[key].entries()) {
      const label = `${key}[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) return `${label} must be an object.`;
      if (typeof item.id !== 'string' || !item.id.replace(/[ \t\r\n]/g, '') || Buffer.byteLength(item.id, 'utf8') > 32) {
        return `${label}.id must contain text and be at most 32 UTF-8 bytes.`;
      }
      if (ids.has(item.id)) return `${key} contains duplicate ID "${item.id}".`;
      ids.add(item.id);
      for (const axis of ['x', 'y']) {
        if (typeof item[axis] !== 'number' || !Number.isFinite(item[axis]) || item[axis] < -1000 || item[axis] > 1000) {
          return `${label}.${axis} must be a finite number between -1000 and 1000.`;
        }
      }
    }
  }
  return null;
}

export function createBridge({
  executable = process.env.RIDER_EXECUTABLE || defaultExecutable,
  timeoutMs = 5000,
  maxConcurrent = 2,
  childArgs = [], // Only server configuration; never taken from a request.
} = {}) {
  let active = 0;
  const routes = new Map([
    ['/api/greedy', 'greedy'], ['/api/optimal', 'optimal'], ['/api/compare', 'both'],
    ['/assign', 'both'], // Preserve the Sprint 1 local endpoint.
  ]);
  const server = createServer(async (request, response) => {
    const requestStart = performance.now();
    const send = (status, value, headers = {}) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
      response.end(JSON.stringify(value));
    };
    const fail = (status, code, message, headers) => send(status, { error: { code, message } }, headers);
    const url = new URL(request.url, 'http://localhost').pathname;

    if (url === '/api/health' || url === '/health') {
      if (request.method !== 'GET') {
        fail(405, 'METHOD_NOT_ALLOWED', 'Use GET for health.', { Allow: 'GET' });
        return;
      }
      try {
        await access(executable, constants.X_OK);
        send(200, { status: 'ok', executableReady: true, limits, activeProcesses: active, maxConcurrent });
      } catch {
        fail(503, 'EXECUTABLE_MISSING', 'C++ executable is missing or not executable. Run npm run build:backend.');
      }
      return;
    }
    if (!routes.has(url)) {
      fail(404, 'NOT_FOUND', 'No endpoint here. Use /api/health, /api/greedy, /api/optimal, or /api/compare.');
      return;
    }
    if (request.method !== 'POST') {
      fail(405, 'METHOD_NOT_ALLOWED', 'Assignment endpoints require POST.', { Allow: 'POST' });
      return;
    }
    if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send Content-Type: application/json.');
      request.resume();
      return;
    }

    const chunks = [];
    let bytes = 0;
    let rejected = false;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > limits.maxBodyBytes) {
        rejected = true;
        chunks.length = 0;
        fail(413, 'REQUEST_TOO_LARGE', 'Request exceeds 64 KiB.');
      } else if (!rejected) chunks.push(chunk);
    });
    request.on('error', () => {
      rejected = true;
      fail(400, 'REQUEST_READ_ERROR', 'Could not read request body.');
    });
    request.on('end', () => {
      if (rejected || response.destroyed) return;
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { fail(400, 'INVALID_JSON', 'Malformed JSON. Send one JSON object with riders and orders arrays.'); return; }
      const validation = validatePayload(payload);
      if (validation) { fail(422, 'INVALID_INPUT', validation); return; }
      if (active >= maxConcurrent) {
        fail(503, 'BACKEND_BUSY', 'Local execution slots are busy. Try again shortly.', { 'Retry-After': '1' });
        return;
      }
      ++active;
      const processStart = performance.now();
      const child = execFile(executable, childArgs, {
        timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024, encoding: 'utf8',
      }, (error, stdout) => {
        --active;
        if (response.destroyed) return;
        if (error?.killed) { fail(504, 'EXECUTION_TIMEOUT', 'C++ execution exceeded the process time limit. Try again.'); return; }
        if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
          fail(503, 'EXECUTABLE_MISSING', 'C++ executable is missing or not executable. Run npm run build:backend.');
          return;
        }
        if (error && error.code !== 1) { fail(502, 'EXECUTION_FAILED', 'C++ process failed or exceeded its output limit.'); return; }
        let output;
        try { output = JSON.parse(stdout); }
        catch { fail(502, 'INVALID_CPP_RESPONSE', 'C++ executable did not return a valid JSON response.'); return; }
        if (!output || typeof output !== 'object' || Array.isArray(output)) {
          fail(502, 'INVALID_CPP_RESPONSE', 'C++ executable did not return a JSON result object.');
          return;
        }
        if (error || output.error) {
          fail(422, output.error?.code || 'CPP_REJECTED_INPUT', output.error?.message || 'C++ rejected the request.');
          return;
        }
        const mode = routes.get(url);
        const body = mode === 'both' ? output : output[mode];
        const hasResult = (result) => result && Array.isArray(result.assignments) && Array.isArray(result.steps)
          && Number.isFinite(result.totalDistance) && Number.isFinite(result.executionTimeMs)
          && Array.isArray(result.unassignedRiderIds) && Array.isArray(result.unassignedOrderIds)
          && result.statistics && Number.isFinite(result.statistics.distanceEvaluations)
          && Number.isFinite(result.statistics.completeAssignments);
        const validResult = mode === 'both'
          ? hasResult(output.greedy) && hasResult(output.optimal) && Number.isFinite(output.comparison?.absoluteDifference)
          : hasResult(body);
        if (!validResult) { fail(502, 'INVALID_CPP_RESPONSE', 'C++ response did not contain a complete requested result.'); return; }
        body.timing = { processElapsedMs: performance.now() - processStart,
          serverElapsedMs: performance.now() - requestStart };
        send(200, body);
      });
      response.on('close', () => { if (!response.writableFinished) child.kill('SIGKILL'); });
      child.stdin.on('error', () => {}); // execFile callback reports spawn/exit failure.
      child.stdin.end(JSON.stringify({ algorithm: routes.get(url), riders: payload.riders, orders: payload.orders }));
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const server = createBridge();
  server.on('error', (error) => { console.error(`Backend: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Backend: http://127.0.0.1:${port}`));
}
