export type Point = { id: string; x: number; y: number };
export type Payload = { riders: Point[]; orders: Point[] };
export type DraftPoint = { key: number; id: string; x: string; y: string };
export type Assignment = { riderId: string; orderId: string; distance: number };
export type Candidate = Assignment & { riderIndex: number; orderIndex: number };
export type Step = { iteration: number; candidates: Candidate[]; selected: Candidate; cumulativeTotal: number };
export type Timing = { processElapsedMs: number; serverElapsedMs: number };
export type AlgorithmResult = {
  assignments: Assignment[]; totalDistance: number;
  unassignedRiderIds: string[]; unassignedOrderIds: string[];
  steps: Step[]; executionTimeMs: number; timingScope: string; explanation: string;
  statistics: { distanceEvaluations: number; completeAssignments: number; recursiveCalls: number;
    candidateChecks: number; bestUpdates: number; bestAssignmentsCopied: number };
  timing?: Timing;
};
export type Comparison = {
  greedy: AlgorithmResult; optimal: AlgorithmResult;
  comparison: { difference: number; absoluteDifference: number; greedyOverheadPercent: number | null; explanation: string };
  timing: Timing;
};
export type Phase = 'ready' | 'loading' | 'running' | 'paused' | 'complete' | 'error';
export type MapMode = 'Greedy' | 'Optimal' | 'Both';
export type Fixture = Payload & { name: string; expected: { greedyTotal: number; optimalTotal: number } };
