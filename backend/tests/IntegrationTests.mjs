import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createBridge, validatePayload } from '../../bridge/server.mjs';

const executable = process.env.RIDER_EXECUTABLE || fileURLToPath(new URL('../../build/rider_assignment', import.meta.url));
const fixtureDirectory = fileURLToPath(new URL('../../datasets/', import.meta.url));
const fakeChild = fileURLToPath(new URL('./helpers/fake-child.mjs', import.meta.url));
const fixtures = readdirSync(fixtureDirectory).filter((name) => name.endsWith('.json')).map((name) =>
  JSON.parse(readFileSync(`${fixtureDirectory}/${name}`, 'utf8')));
const failure = fixtures.find((fixture) => fixture.name === 'greedy_failure');
const valid = { riders: [{ id: 'R1', x: 0, y: 0 }], orders: [{ id: 'O1', x: 1, y: 0 }] };
const headers = { 'Content-Type': 'application/json' };

function run(input) {
  const result = spawnSync(executable, [], { input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  assert.ifError(result.error);
  if (result.status === 0) assert.equal(result.stderr, '');
  else assert.match(result.stderr, /rider_assignment:/);
  return { status: result.status, output: JSON.parse(result.stdout) };
}
async function withServer(options, callback) {
  const server = createBridge({ executable, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
async function post(base, endpoint, value) {
  const response = await fetch(`${base}/api/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(value) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`); }
function checkResult(result, fixture, algorithm) {
  near(result.totalDistance, fixture.expected[`${algorithm}Total`]);
  assert.deepEqual(result.unassignedRiderIds, fixture.expected.unassignedRiderIds);
  assert.deepEqual(result.unassignedOrderIds, fixture.expected.unassignedOrderIds);
  assert.equal(result.assignments.length, Math.min(fixture.riders.length, fixture.orders.length));
  assert.ok(Number.isFinite(result.executionTimeMs) && result.executionTimeMs >= 0);
  assert.match(result.timingScope, /excludes JSON, process startup, and HTTP/);
  if (!result.assignments.length) assert.match(result.explanation, /empty/);
}

test('CLI verifies all twelve fixtures, actual trace, and explicit zero overhead', () => {
  assert.equal(fixtures.length, 12);
  for (const fixture of fixtures) {
    const { status, output } = run(JSON.stringify(fixture));
    assert.equal(status, 0);
    checkResult(output.greedy, fixture, 'greedy');
    checkResult(output.optimal, fixture, 'optimal');
    const trace = output.greedy.steps;
    assert.equal(trace.reduce((count, step) => count + step.candidates.length, 0), output.greedy.statistics.distanceEvaluations);
    trace.forEach((step, index) => {
      const { riderIndex, orderIndex, ...assignment } = step.selected;
      assert.deepEqual(assignment, output.greedy.assignments[index]);
      assert.equal(fixture.riders[riderIndex].id, assignment.riderId);
      assert.equal(fixture.orders[orderIndex].id, assignment.orderId);
    });
    if (fixture.expected.optimalTotal === 0) {
      assert.equal(output.comparison.greedyOverheadPercent, 0);
      assert.match(output.comparison.explanation, /Both totals are zero/);
    }
  }
});

test('real HTTP integration: every Sprint 1 fixture through every algorithm endpoint', async () => {
  await withServer({}, async (base) => {
    for (const fixture of fixtures) {
      for (const endpoint of ['greedy', 'optimal', 'compare']) {
        const { status, body } = await post(base, endpoint, fixture);
        assert.equal(status, 200, fixture.name);
        if (endpoint === 'compare') {
          checkResult(body.greedy, fixture, 'greedy');
          checkResult(body.optimal, fixture, 'optimal');
          near(body.comparison.absoluteDifference, Math.abs(fixture.expected.greedyTotal - fixture.expected.optimalTotal));
        } else checkResult(body, fixture, endpoint);
        assert.ok(Number.isFinite(body.timing.processElapsedMs));
        assert.ok(body.timing.serverElapsedMs >= body.timing.processElapsedMs);
      }
    }
  });
});

test('HTTP counterexample: 7 versus 5, 40 percent, counts, and separate timing scopes', async () => {
  await withServer({}, async (base) => {
    const { status, body } = await post(base, 'compare', failure);
    assert.equal(status, 200);
    assert.equal(body.greedy.totalDistance, 7);
    assert.equal(body.optimal.totalDistance, 5);
    assert.equal(body.comparison.absoluteDifference, 2);
    assert.equal(body.comparison.greedyOverheadPercent, 40);
    assert.equal(body.greedy.statistics.distanceEvaluations, 14);
    assert.equal(body.optimal.statistics.completeAssignments, 6);
    assert.ok(body.timing.processElapsedMs >= body.greedy.executionTimeMs + body.optimal.executionTimeMs);
  });
});

const invalidPayloads = [
  null, [], {}, { ...valid, riders: {} },
  { ...valid, riders: [{ id: '', x: 0, y: 0 }] },
  { ...valid, riders: [{ id: '  ', x: 0, y: 0 }] },
  { ...valid, riders: [valid.riders[0], valid.riders[0]] },
  { ...valid, orders: [valid.orders[0], valid.orders[0]] },
  { ...valid, orders: [{ id: 'O1', x: '1', y: 0 }] },
  { ...valid, orders: [{ id: 'O1', x: null, y: 0 }] },
  { ...valid, orders: [{ id: 'O1', x: true, y: 0 }] },
  { ...valid, orders: [{ id: 'O1', x: 1000.001, y: 0 }] },
  { ...valid, riders: [{ id: 'R1', x: -1001, y: 0 }] },
  { ...valid, orders: [{ id: 'O1', x: 0 }] },
  { ...valid, riders: Array.from({ length: 9 }, (_, i) => ({ id: `R${i}`, x: i, y: 0 })) },
  { ...valid, orders: Array.from({ length: 9 }, (_, i) => ({ id: `O${i}`, x: i, y: 0 })) },
  { ...valid, riders: [{ id: 'a'.repeat(33), x: 0, y: 0 }] },
];

test('API and C++ boundary independently reject invalid fields, duplicates, numbers, and group sizes', async () => {
  await withServer({}, async (base) => {
    for (const value of invalidPayloads) {
      const result = await post(base, 'greedy', value);
      assert.equal(result.status, 422);
      assert.equal(typeof result.body.error.message, 'string');
      const cpp = run(JSON.stringify(value));
      assert.equal(cpp.status, 1);
      assert.equal(typeof cpp.output.error.code, 'string');
      assert.equal(typeof cpp.output.error.message, 'string');
    }
    assert.match(validatePayload({ ...valid, riders: [{ id: 'R1', x: Infinity, y: 0 }] }), /finite/);
    assert.match(validatePayload({ ...valid, riders: [{ id: 'R1', x: NaN, y: 0 }] }), /finite/);
    assert.equal(run('{"riders":[{"id":"R1","x":1e999,"y":0}],"orders":[]}').status, 1);
    const nonfinite = await fetch(`${base}/api/greedy`, { method: 'POST', headers,
      body: '{"riders":[{"id":"R1","x":1e999,"y":0}],"orders":[]}' });
    assert.equal(nonfinite.status, 422);
  });
});

test('malformed JSON, request-size limit, methods, and content type use consistent JSON errors', async () => {
  await withServer({}, async (base) => {
    for (const input of ['', '{', '{} {}']) {
      const response = await fetch(`${base}/api/compare`, { method: 'POST', headers, body: input });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_JSON');
      assert.equal(run(input).status, 1);
    }
    const input = ' '.repeat(65537);
    const response = await fetch(`${base}/api/greedy`, { method: 'POST', headers, body: input });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, 'REQUEST_TOO_LARGE');
    assert.equal(run(input).output.error.code, 'REQUEST_TOO_LARGE');
    assert.equal((await fetch(`${base}/api/greedy`)).status, 405);
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
    assert.equal((await fetch(`${base}/api/greedy`, { method: 'POST', body: '{}' })).status, 415);
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).limits.maxPerGroup, 8);
  });
});

test('eight equal pairs remain bounded at 40320 complete assignments and deterministic ties', async () => {
  const members = Array.from({ length: 8 }, (_, i) => ({ id: String(i), x: 0, y: 0 }));
  await withServer({}, async (base) => {
    let first;
    for (let repeat = 0; repeat < 3; ++repeat) {
      const { status, body } = await post(base, 'compare', { riders: members, orders: members });
      assert.equal(status, 200);
      assert.equal(body.optimal.statistics.completeAssignments, 40320);
      assert.equal(body.greedy.statistics.distanceEvaluations, 204);
      assert.equal(body.comparison.greedyOverheadPercent, 0);
      const assignments = [body.greedy.assignments, body.optimal.assignments];
      if (first) assert.deepEqual(assignments, first);
      else first = assignments;
    }
  });
});

test('Unicode IDs, negatives, boundary coordinates, and CLI modes are preserved', async () => {
  const value = { riders: [{ id: 'R"\\🚲', x: -1000, y: 0 }], orders: [{ id: 'O\n🍲', x: 1000, y: 0 }] };
  await withServer({}, async (base) => {
    const result = await post(base, 'compare', value);
    assert.equal(result.status, 200);
    assert.equal(result.body.greedy.totalDistance, 2000);
    assert.equal(result.body.greedy.assignments[0].riderId, value.riders[0].id);
  });
  for (const algorithm of ['greedy', 'optimal']) {
    assert.deepEqual(Object.keys(run(JSON.stringify({ ...valid, algorithm })).output), [algorithm]);
  }
  assert.equal(run(JSON.stringify(valid)).status, 0);
});

test('missing executable gives actionable HTTP errors without taking down the server', async () => {
  await withServer({ executable: '/nonexistent/greedy-rider-executable' }, async (base) => {
    const result = await post(base, 'greedy', valid);
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'EXECUTABLE_MISSING');
    assert.match(result.body.error.message, /build:backend/);
    assert.equal((await fetch(`${base}/api/health`)).status, 503);
  });
});

test('child timeout kills execution and releases its concurrency slot', async () => {
  await withServer({ executable: process.execPath, childArgs: [fakeChild, 'sleep'], timeoutMs: 50, maxConcurrent: 1 }, async (base) => {
    const result = await post(base, 'greedy', valid);
    assert.equal(result.status, 504);
    assert.equal(result.body.error.code, 'EXECUTION_TIMEOUT');
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.activeProcesses, 0);
  });
});

for (const mode of ['crash', 'invalid', 'incomplete', 'null']) {
  test(`backend ${mode} response is a recoverable structured error`, async () => {
    await withServer({ executable: process.execPath, childArgs: [fakeChild, mode] }, async (base) => {
      const result = await post(base, 'greedy', valid);
      assert.equal(result.status, 502);
      assert.equal(typeof result.body.error.message, 'string');
      assert.equal((await fetch(`${base}/api/health`)).status, 200);
    });
  });
}

test('concurrent execution is controlled; busy requests are rejected and later requests recover', async () => {
  await withServer({ executable: process.execPath, childArgs: [fakeChild, 'slow-valid', executable], maxConcurrent: 1 }, async (base) => {
    const first = post(base, 'greedy', valid);
    let active = 0;
    for (let attempt = 0; attempt < 30 && !active; ++attempt) {
      active = (await (await fetch(`${base}/api/health`)).json()).activeProcesses;
      if (!active) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(active, 1);
    const busy = await post(base, 'greedy', valid);
    assert.equal(busy.status, 503);
    assert.equal(busy.body.error.code, 'BACKEND_BUSY');
    assert.equal(busy.headers.get('retry-after'), '1');
    assert.equal((await first).status, 200);
    assert.equal((await post(base, 'greedy', valid)).status, 200);
  });
});
