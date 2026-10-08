import type { DraftPoint, Fixture, Payload } from './types';

const loaded = import.meta.glob('../../datasets/*.json', { eager: true, import: 'default' }) as Record<string, Fixture>;
const primary = ['greedy_failure', 'simple', 'larger_fixed'];
export const fixtures = Object.values(loaded).sort((a, b) => {
  const ai = primary.indexOf(a.name); const bi = primary.indexOf(b.name);
  return (ai < 0 ? 10 : ai) - (bi < 0 ? 10 : bi) || a.name.localeCompare(b.name);
});
export const fixtureLabels: Record<string, string> = {
  greedy_failure: 'Greedy failure · 7 vs 5', simple: 'Simple · both total 3', larger_fixed: 'Larger fixed · 6 pairs',
  unequal_counts: 'Unequal counts · 3 riders, 2 orders', more_orders: 'More orders · 2 riders, 3 orders',
  negative_coordinates: 'Negative coordinates', coincident_zero: 'Coincident points · total zero',
  deterministic_ties: 'Equal distances · deterministic ties', empty_both: 'Empty groups',
  empty_orders: 'No orders', empty_riders: 'No riders', precision_near_tie: 'Precision · near tie',
};
let nextKey = 0;
export function toDraft(points: Payload['riders']): DraftPoint[] {
  return points.map((point) => ({ key: ++nextKey, id: point.id, x: String(point.x), y: String(point.y) }));
}
export function newPoint(id: string): DraftPoint { return { key: ++nextKey, id, x: '0', y: '0' }; }
export function validateDraft(points: DraftPoint[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const ids = new Map<string, number>();
  points.forEach((point) => ids.set(point.id, (ids.get(point.id) || 0) + 1));
  for (const point of points) {
    if (!point.id.replace(/[ \t\r\n]/g, '') || new TextEncoder().encode(point.id).length > 32) {
      errors[`${point.key}-id`] = 'Use a nonempty ID of at most 32 UTF-8 bytes.';
    } else if ((ids.get(point.id) || 0) > 1) errors[`${point.key}-id`] = 'IDs must be unique within this group.';
    for (const axis of ['x', 'y'] as const) {
      const raw = point[axis].trim();
      const number = Number(raw);
      if (!raw || !Number.isFinite(number) || number < -1000 || number > 1000) {
        errors[`${point.key}-${axis}`] = 'Enter a finite number from −1000 to 1000.';
      }
    }
  }
  return errors;
}
export function toPoints(points: DraftPoint[]): Payload['riders'] {
  return points.map((point) => ({ id: point.id, x: Number(point.x), y: Number(point.y) }));
}
// Reproducible coordinate generation only; no assignment logic lives here.
export function randomDataset(seed: number, riderCount: number, orderCount: number): Payload {
  let state = seed >>> 0;
  const coordinate = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * 31) - 10;
  };
  const group = (prefix: string, count: number) => Array.from({ length: count }, (_, index) =>
    ({ id: `${prefix}${index + 1}`, x: coordinate(), y: coordinate() }));
  return { riders: group('R', riderCount), orders: group('O', orderCount) };
}
export const formatDistance = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(Object.is(value, -0) ? 0 : value);
