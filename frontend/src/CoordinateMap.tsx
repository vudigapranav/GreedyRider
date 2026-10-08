import { useEffect, useRef, useState } from 'react';
import { formatDistance } from './data';
import type { Assignment, MapMode, Payload, Step } from './types';

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x
  && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
function placeLabel(px: number, py: number, w: number, width: number, height: number, occupied: Box[]): Box {
  let best = { x: 20, y: 20, w, h: 20 };
  let bestCost = Infinity;
  for (let ring = 1; ring <= 12; ++ring) {
    for (const [dx, dy] of [[1, -1], [1, 0], [-1, -1], [-1, 0], [0, -1], [0, 1], [1, 1], [-1, 1]]) {
      const box = { x: Math.max(17, Math.min(width - w - 17, px + dx * ring * 23 - (dx <= 0 ? w : 0))),
        y: Math.max(16, Math.min(height - 48, py + dy * ring * 23 - 10)), w, h: 20 };
      const collisions = occupied.filter((other) => overlaps(box, other)).length;
      const offsetCost = Math.abs(box.x + w / 2 - px) + Math.abs(box.y + 10 - py);
      const cost = collisions * 10000 + offsetCost;
      if (cost < bestCost) { best = box; bestCost = cost; }
    }
    if (bestCost < 10000) break;
  }
  return best;
}
function tickStep(span: number) {
  const raw = span / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / power;
  return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10) * power;
}

export default function CoordinateMap({ payload, assignments, optimal, selected, mode }: {
  payload: Payload; assignments: Assignment[]; optimal: Assignment[]; selected: Step | null; mode: MapMode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const update = () => { if (container.current) setWidth(Math.max(280, container.current.clientWidth)); };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = width < 520 ? 350 : 410;
  const points = [
    ...payload.riders.map((point, index) => ({ ...point, group: 'rider' as const, key: `r-${index}` })),
    ...payload.orders.map((point, index) => ({ ...point, group: 'order' as const, key: `o-${index}` })),
  ];
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const minX = Math.min(0, ...valid.map((point) => point.x));
  const maxX = Math.max(0, ...valid.map((point) => point.x));
  const minY = Math.min(0, ...valid.map((point) => point.y));
  const maxY = Math.max(0, ...valid.map((point) => point.y));
  const rangeX = Math.max(4, maxX - minX); const rangeY = Math.max(4, maxY - minY);
  const scale = Math.min((width - 130) / (rangeX * 1.18), (height - 110) / (rangeY * 1.18));
  const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
  const sx = (x: number) => width / 2 + 10 + (x - cx) * scale;
  const sy = (y: number) => height / 2 - 8 - (y - cy) * scale;
  const worldLeft = cx + (52 - width / 2 - 10) / scale;
  const worldRight = cx + (width - 25 - width / 2 - 10) / scale;
  const worldBottom = cy - (height - 42 - height / 2 + 8) / scale;
  const worldTop = cy - (25 - height / 2 + 8) / scale;
  const xStep = tickStep(worldRight - worldLeft); const yStep = tickStep(worldTop - worldBottom);
  const xTicks: number[] = []; const yTicks: number[] = [];
  for (let k = Math.ceil(worldLeft / xStep); k <= Math.floor(worldRight / xStep); ++k) xTicks.push(k * xStep);
  for (let k = Math.ceil(worldBottom / yStep); k <= Math.floor(worldTop / yStep); ++k) yTicks.push(k * yStep);
  const occupied: Box[] = valid.map((point) => ({ x: sx(point.x) - 12, y: sy(point.y) - 12, w: 24, h: 24 }));
  const positioned = valid.map((point) => {
    const text = point.id.length > 11 ? `${point.id.slice(0, 9)}…` : point.id || '?';
    const box = placeLabel(sx(point.x), sy(point.y), Math.max(30, text.length * 7 + 12), width, height, occupied);
    occupied.push(box);
    return { ...point, text, box };
  });
  const consumedRiders = new Set(assignments.map((assignment) => assignment.riderId));
  const consumedOrders = new Set(assignments.map((assignment) => assignment.orderId));
  const selectedPair = selected?.selected;
  const lineFor = (assignment: Assignment) => {
    const rider = payload.riders.find((point) => point.id === assignment.riderId);
    const order = payload.orders.find((point) => point.id === assignment.orderId);
    if (!rider || !order || !Number.isFinite(rider.x + rider.y + order.x + order.y)) return null;
    return { x1: sx(rider.x), y1: sy(rider.y), x2: sx(order.x), y2: sy(order.y) };
  };
  const selectedLine = selectedPair && lineFor(selectedPair);
  const caption = selectedLine && selectedPair ? placeLabel((selectedLine.x1 + selectedLine.x2) / 2,
    (selectedLine.y1 + selectedLine.y2) / 2, 91, width, height, occupied) : null;
  const coincident = new Set(valid.map((point) => `${point.x},${point.y}`)).size < valid.length;

  return <div className="map-surface" ref={container}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="map-title map-description" data-testid="coordinate-map">
      <title id="map-title">Rider and order coordinate map</title>
      <desc id="map-description">Equal scale on both axes. Riders are indigo circles, orders are orange squares.
        Solid indigo lines show greedy assignments; dashed teal lines show optimal assignments.
        {coincident ? ' Some markers share a location; separate labels identify each entity.' : ''}</desc>
      <g className="grid-lines" aria-hidden="true">
        {xTicks.map((x) => <line key={`x${x}`} x1={sx(x)} y1={25} x2={sx(x)} y2={height - 42} />)}
        {yTicks.map((y) => <line key={`y${y}`} x1={52} y1={sy(y)} x2={width - 25} y2={sy(y)} />)}
      </g>
      <g className="axes" aria-hidden="true">
        <line x1={52} y1={sy(0)} x2={width - 25} y2={sy(0)} />
        <line x1={sx(0)} y1={25} x2={sx(0)} y2={height - 42} />
        {xTicks.map((x) => <text key={x} x={sx(x)} y={height - 21} textAnchor="middle">{formatDistance(x)}</text>)}
        {yTicks.map((y) => <text key={y} x={43} y={sy(y) + 4} textAnchor="end">{formatDistance(y)}</text>)}
        <text x={width - 19} y={height - 20} className="axis-name">X</text>
        <text x={37} y={18} className="axis-name">Y</text>
      </g>
      {selectedLine && mode !== 'Optimal' && <path className="selected-underlay" aria-hidden="true"
        d={`M ${selectedLine.x1} ${selectedLine.y1} L ${selectedLine.x2} ${selectedLine.y2}`} />}
      {mode !== 'Optimal' && assignments.map((assignment) => {
        const line = lineFor(assignment); if (!line) return null;
        return <path key={`g-${assignment.riderId}-${assignment.orderId}`} className="connection greedy-line"
          pathLength={1} d={`M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`} data-testid="greedy-line">
          <title>Greedy: {assignment.riderId} to {assignment.orderId}, {formatDistance(assignment.distance)} units</title>
        </path>;
      })}
      {mode !== 'Greedy' && optimal.map((assignment) => {
        const line = lineFor(assignment); if (!line) return null;
        return <path key={`o-${assignment.riderId}-${assignment.orderId}`} className="connection optimal-line"
          d={`M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`} data-testid="optimal-line">
          <title>Optimal: {assignment.riderId} to {assignment.orderId}, {formatDistance(assignment.distance)} units</title>
        </path>;
      })}
      {positioned.map((point) => {
        const consumed = point.group === 'rider' ? consumedRiders.has(point.id) : consumedOrders.has(point.id);
        const isSelected = selectedPair && (point.group === 'rider' ? selectedPair.riderId === point.id : selectedPair.orderId === point.id);
        const x = sx(point.x); const y = sy(point.y);
        return <g key={point.key} data-testid="map-point" data-group={point.group} data-id={point.id}
          data-consumed={consumed} data-selected={!!isSelected}>
          <title>{point.group === 'rider' ? 'Rider' : 'Order'} {point.id}: ({point.x}, {point.y}){consumed ? ', assigned by greedy' : ', available'}</title>
          {isSelected && <circle cx={x} cy={y} r={19} className="selected-halo" aria-hidden="true" />}
          <line x1={x} y1={y} x2={point.box.x + point.box.w / 2} y2={point.box.y + 10} className="label-leader" aria-hidden="true" />
          {point.group === 'rider'
            ? <circle cx={x} cy={y} r={9} className={`rider-marker ${consumed ? 'consumed' : ''}`} />
            : <rect x={x - 6} y={y - 6} width={12} height={12} className={`order-marker ${consumed ? 'consumed' : ''}`} />}
          <rect x={point.box.x} y={point.box.y} width={point.box.w} height={point.box.h} rx={4} className="point-label-bg" />
          <text x={point.box.x + 6} y={point.box.y + 14} className="point-label" data-testid="point-label">{point.text}</text>
        </g>;
      })}
      {caption && selectedPair && mode !== 'Optimal' && <g aria-hidden="true">
        <rect x={caption.x} y={caption.y} width={caption.w} height={caption.h} rx={5} className="distance-label-bg" />
        <text x={caption.x + caption.w / 2} y={caption.y + 14} textAnchor="middle" className="distance-label">{formatDistance(selectedPair.distance)} units</text>
      </g>}
      {!valid.length && <text x={width / 2} y={height / 2} textAnchor="middle" className="map-empty">Add a rider and an order to begin.</text>}
    </svg>
    <div className="map-footnote">Equal X / Y scale · Euclidean distance in coordinate units
      {coincident && <span>Shared locations use separate labels; the markers stay at their true coordinates.</span>}</div>
  </div>;
}
