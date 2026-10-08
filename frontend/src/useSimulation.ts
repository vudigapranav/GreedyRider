import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlgorithmResult, Comparison, Payload, Phase } from './types';

type State = {
  phase: Phase; greedy: AlgorithmResult | null; comparison: Comparison | null; visibleSteps: number;
  error: string | null; pending: 'greedy' | 'optimal' | null; retry: 'greedy' | 'optimal';
  greedyRequestMs: number | null; compareRequestMs: number | null;
};
const initial: State = { phase: 'ready', greedy: null, comparison: null, visibleSteps: 0,
  error: null, pending: null, retry: 'greedy', greedyRequestMs: null, compareRequestMs: null };

function isResult(value: unknown): value is AlgorithmResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as AlgorithmResult;
  return Number.isFinite(result.totalDistance) && Number.isFinite(result.executionTimeMs)
    && Array.isArray(result.assignments) && Array.isArray(result.steps)
    && Array.isArray(result.unassignedRiderIds) && Array.isArray(result.unassignedOrderIds)
    && !!result.statistics && Number.isFinite(result.statistics.distanceEvaluations)
    && Number.isFinite(result.statistics.completeAssignments);
}

async function request<T>(endpoint: string, payload: Payload, signal: AbortSignal): Promise<{ result: T; elapsed: number }> {
  const start = performance.now();
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The backend did not return JSON. Start the API server, then retry.'); }
  if (!response.ok) throw new Error(result?.error?.message || `The backend returned HTTP ${response.status}. Please retry.`);
  const valid = endpoint === 'compare'
    ? isResult(result?.greedy) && isResult(result?.optimal) && Number.isFinite(result?.comparison?.absoluteDifference)
      && (result?.comparison?.greedyOverheadPercent === null || Number.isFinite(result?.comparison?.greedyOverheadPercent))
      && Number.isFinite(result?.timing?.processElapsedMs)
    : isResult(result);
  if (!valid) throw new Error('The backend returned an incomplete result. Check the C++ executable and retry.');
  return { result, elapsed: performance.now() - start };
}

export function useSimulation() {
  const [state, setState] = useState<State>(initial);
  const version = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    abort.current?.abort();
    abort.current = null;
    ++version.current;
  }, []);
  const reset = useCallback(() => { stop(); setState(initial); }, [stop]);

  const start = useCallback(async (payload: Payload) => {
    stop();
    const generation = version.current;
    const controller = new AbortController();
    abort.current = controller;
    setState({ ...initial, phase: 'loading', pending: 'greedy' });
    try {
      const { result, elapsed } = await request<AlgorithmResult>('greedy', payload, controller.signal);
      if (generation !== version.current || controller.signal.aborted) return;
      setState({ ...initial, phase: result.steps.length ? 'paused' : 'complete', greedy: result, greedyRequestMs: elapsed });
    } catch (error) {
      if (generation !== version.current || controller.signal.aborted) return;
      setState({ ...initial, phase: 'error', error: error instanceof Error ? error.message : 'Request failed. Please retry.' });
    }
  }, [stop]);

  const findOptimal = useCallback(async (payload: Payload) => {
    stop();
    const generation = version.current;
    const controller = new AbortController();
    abort.current = controller;
    setState((previous) => ({ ...previous, phase: 'loading', pending: 'optimal', error: null, retry: 'optimal' }));
    try {
      const { result, elapsed } = await request<Comparison>('compare', payload, controller.signal);
      if (generation !== version.current || controller.signal.aborted) return;
      setState((previous) => ({ ...previous, phase: 'complete', pending: null, comparison: result, compareRequestMs: elapsed }));
    } catch (error) {
      if (generation !== version.current || controller.signal.aborted) return;
      setState((previous) => ({ ...previous, phase: 'error', pending: null, retry: 'optimal',
        error: error instanceof Error ? error.message : 'Optimal search failed. Please retry.' }));
    }
  }, [stop]);

  const next = useCallback(() => {
    setState((previous) => {
      if (!previous.greedy || !['paused', 'running'].includes(previous.phase)) return previous;
      const visibleSteps = Math.min(previous.visibleSteps + 1, previous.greedy.steps.length);
      return { ...previous, visibleSteps, phase: visibleSteps === previous.greedy.steps.length ? 'complete' : 'paused' };
    });
  }, []);
  const togglePlayback = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState((previous) => ({ ...previous, phase: previous.phase === 'running' ? 'paused' : 'running' }));
  }, []);

  useEffect(() => {
    if (state.phase !== 'running' || !state.greedy) return;
    const generation = version.current;
    timer.current = setTimeout(() => {
      if (generation !== version.current) return;
      setState((previous) => {
        if (previous.phase !== 'running' || !previous.greedy) return previous;
        const visibleSteps = Math.min(previous.visibleSteps + 1, previous.greedy.steps.length);
        return { ...previous, visibleSteps, phase: visibleSteps === previous.greedy.steps.length ? 'complete' : 'running' };
      });
    }, 950);
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, [state.phase, state.visibleSteps, state.greedy]);
  useEffect(() => () => stop(), [stop]);
  return { state, reset, start, findOptimal, next, togglePlayback };
}
