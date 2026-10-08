import { useEffect, useRef, useState } from 'react';
import cppSource from '../../backend/GreedyAssignment.cpp?raw';
import CoordinateMap from './CoordinateMap';
import { fixtureLabels, fixtures, formatDistance, newPoint, randomDataset, toDraft, toPoints, validateDraft } from './data';
import { useSimulation } from './useSimulation';
import type { AlgorithmResult, Assignment, DraftPoint, MapMode, Payload, Step } from './types';

const initialFixture = fixtures.find((fixture) => fixture.name === 'greedy_failure')!;
const snippetLines = cppSource.split('\n');
const snippetStart = snippetLines.findIndex((line) => line.includes('const double distance = euclideanDistance'));
const snippetEnd = snippetLines.findIndex((line) => line.includes('step.selected = candidate;')) + 2;
const snippet = snippetLines.slice(snippetStart, snippetEnd).map((line) => line.replace(/^ {16}/, '')).join('\n');

function PointEditor({ group, points, errors, onChange }: {
  group: 'riders' | 'orders'; points: DraftPoint[]; errors: Record<string, string>;
  onChange: (points: DraftPoint[]) => void;
}) {
  const singular = group === 'riders' ? 'Rider' : 'Order';
  const add = () => {
    let index = 1; const prefix = group === 'riders' ? 'R' : 'O';
    while (points.some((point) => point.id === `${prefix}${index}`)) ++index;
    onChange([...points, newPoint(`${prefix}${index}`)]);
  };
  return <section className="point-editor" aria-label={`${singular} coordinates`}>
    <div className="editor-heading"><h3><span className={`legend-marker ${group === 'riders' ? 'rider' : 'order'}`} />{singular}s <span className="count">{points.length}/8</span></h3>
      <button className="text-button" onClick={add} disabled={points.length >= 8}>+ Add {singular.toLowerCase()}</button></div>
    <div className="point-row row-head" aria-hidden="true"><span>ID</span><span>X</span><span>Y</span><span /></div>
    {points.map((point, index) => <div key={point.key} className="point-entry">
      <div className="point-row">
        {(['id', 'x', 'y'] as const).map((field) => <input key={field} type="text"
          inputMode={field === 'id' ? 'text' : 'decimal'} value={point[field]}
          maxLength={field === 'id' ? 32 : 24} aria-label={`${singular} ${index + 1} ${field.toUpperCase()}`}
          aria-invalid={!!errors[`${point.key}-${field}`]} aria-describedby={errors[`${point.key}-${field}`] ? `error-${point.key}-${field}` : undefined}
          onChange={(event) => onChange(points.map((item) => item.key === point.key ? { ...item, [field]: event.target.value } : item))} />)}
        <button className="remove-button" aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`} onClick={() => onChange(points.filter((item) => item.key !== point.key))}>×</button>
      </div>
      {(['id', 'x', 'y'] as const).map((field) => errors[`${point.key}-${field}`]
        ? <p className="field-error" id={`error-${point.key}-${field}`} key={field}>{field.toUpperCase()}: {errors[`${point.key}-${field}`]}</p> : null)}
    </div>)}
    {!points.length && <p className="empty-group">No {group}. Add one above, or load a dataset.</p>}
  </section>;
}
function AssignmentTable({ assignments, label }: { assignments: Assignment[]; label: string }) {
  return <div className="table-scroll"><table className="assignment-table" aria-label={label}>
    <thead><tr><th>Rider</th><th>Order</th><th className="numeric">Distance</th></tr></thead>
    <tbody>{assignments.map((assignment) => <tr key={`${assignment.riderId}-${assignment.orderId}`}>
      <td>{assignment.riderId}</td><td>{assignment.orderId}</td><td className="numeric">{formatDistance(assignment.distance)}</td>
    </tr>)}</tbody>
  </table>{!assignments.length && <p className="table-placeholder">No assignments yet.</p>}</div>;
}
function Unassigned({ result, label }: { result: AlgorithmResult; label: string }) {
  return <div className="unassigned" aria-label={`${label} unassigned IDs`}>
    <span><strong>Unassigned riders:</strong> {result.unassignedRiderIds.join(', ') || 'None'}</span>
    <span><strong>Unassigned orders:</strong> {result.unassignedOrderIds.join(', ') || 'None'}</span>
  </div>;
}
function CandidateTable({ step }: { step: Step | null }) {
  return <div className="candidate-panel">
    <div className="subheading"><h3>Available distances</h3><span>{step ? `${step.candidates.length} pairs` : 'Awaiting a step'}</span></div>
    {step ? <div className="table-scroll candidate-scroll" tabIndex={0} aria-label="Scrollable available-distance table">
      <table aria-label="Available candidate pairs" data-testid="candidate-table">
        <thead><tr><th>Rider → Order</th><th className="numeric">Distance</th><th>Choice</th></tr></thead>
        <tbody>{step.candidates.map((candidate) => {
          const selected = candidate.riderIndex === step.selected.riderIndex && candidate.orderIndex === step.selected.orderIndex;
          return <tr key={`${candidate.riderIndex}-${candidate.orderIndex}`} className={selected ? 'selected-row' : ''} data-selected={selected}>
            <td>{candidate.riderId} → {candidate.orderId}</td><td className="numeric">{formatDistance(candidate.distance)}</td>
            <td>{selected ? <span className="minimum-tag">Minimum</span> : '—'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="table-placeholder">Each recorded step lists every currently available rider–order pair.</p>}
    <p className="small-note">Display rounded to 3 decimals. C++ compares and sums full-precision values; exact ties use input order.</p>
  </div>;
}

export default function App() {
  const [riders, setRiders] = useState(() => toDraft(initialFixture.riders));
  const [orders, setOrders] = useState(() => toDraft(initialFixture.orders));
  const [fixtureChoice, setFixtureChoice] = useState(initialFixture.name);
  const [datasetName, setDatasetName] = useState('Greedy failure example');
  const [randomRiders, setRandomRiders] = useState('3'); const [randomOrders, setRandomOrders] = useState('3');
  const [seed, setSeed] = useState('20261007');
  const [mapMode, setMapMode] = useState<MapMode>('Greedy');
  const [editOpen, setEditOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const { state, reset, start, findOptimal, next, togglePlayback } = useSimulation();
  const page = useRef<HTMLDivElement>(null);
  const riderErrors = validateDraft(riders); const orderErrors = validateDraft(orders);
  const valid = Object.keys(riderErrors).length === 0 && Object.keys(orderErrors).length === 0;
  const payload: Payload = { riders: toPoints(riders), orders: toPoints(orders) };
  // Invalid editor text is omitted from the map until corrected; it is never sent.
  const mapPayload: Payload = {
    riders: payload.riders.filter((_, index) => !riderErrors[`${riders[index].key}-x`] && !riderErrors[`${riders[index].key}-y`]),
    orders: payload.orders.filter((_, index) => !orderErrors[`${orders[index].key}-x`] && !orderErrors[`${orders[index].key}-y`]),
  };
  const assignments = state.greedy?.assignments.slice(0, state.visibleSteps) || [];
  const step = state.visibleSteps && state.greedy ? state.greedy.steps[state.visibleSteps - 1] : null;
  const total = step?.cumulativeTotal || 0;
  const replayComplete = !!state.greedy && state.visibleSteps === state.greedy.steps.length;
  const randomValid = /^\d+$/.test(seed) && Number(seed) <= 4294967295
    && [randomRiders, randomOrders].every((raw) => /^\d+$/.test(raw) && Number(raw) >= 2 && Number(raw) <= 8);
  const invalidate = () => { reset(); setMapMode('Greedy'); };
  const editRiders = (points: DraftPoint[]) => { invalidate(); setRiders(points); setDatasetName('Custom coordinates'); };
  const editOrders = (points: DraftPoint[]) => { invalidate(); setOrders(points); setDatasetName('Custom coordinates'); };
  const load = (value: Payload, name: string) => {
    invalidate(); setRiders(toDraft(value.riders)); setOrders(toDraft(value.orders)); setDatasetName(name);
  };
  useEffect(() => { if (state.comparison) setMapMode('Both'); }, [state.comparison]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('entered'); observer.unobserve(entry.target); } });
    }, { threshold: 0.08 });
    page.current?.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  const phaseLabels = { ready: 'Ready', loading: state.pending === 'optimal' ? 'Finding optimal' : 'Loading C++ result',
    running: 'Running', paused: state.visibleSteps ? 'Paused' : 'Ready to replay', complete: 'Complete', error: 'Needs attention' };
  const liveMessage = state.phase === 'loading' ? phaseLabels.loading
    : state.error ? `Request failed. ${state.error}`
    : step ? `Step ${state.visibleSteps} of ${state.greedy?.steps.length}: ${step.selected.riderId} assigned to ${step.selected.orderId}, distance ${formatDistance(step.selected.distance)}. Cumulative total ${formatDistance(total)}.${replayComplete ? ' Greedy replay complete. Optimal search is available.' : ''}`
    : state.greedy ? state.greedy.steps.length ? 'C++ trace loaded. Use Next Step or Run Automatically.' : state.greedy.explanation
    : 'Ready. Start to compute the greedy assignment.';
  const comparison = state.comparison?.comparison;
  const matched = comparison && comparison.absoluteDifference <= 1e-10 * Math.max(1, state.comparison!.optimal.totalDistance);

  return <div ref={page}>
    <a className="skip-link" href="#simulation-controls">Skip to simulation controls</a>
    <div className="app-shell">
      <header className="page-header">
        <div className="header-top"><a href="#" className="wordmark" aria-label="Algorithm lab home"><span className="lab-symbol" aria-hidden="true">◉ ▪</span> DAA / ALGORITHM LAB</a>
          <a href="#how-it-works" className="header-link">How it works <span aria-hidden="true">↗</span></a></div>
        <div className="header-copy"><p className="eyebrow">Greedy Minimum-Distance Assignment</p>
          <h1>Food Delivery Rider Assignment</h1>
          <p className="description">An interactive demonstration of greedy rider-order assignment and its limitations compared with global optimization.</p>
          <span className="topic-badge">Greedy Algorithm · Optimization · Complexity Analysis</span>
        </div>
      </header>

      <main>
        <div className="workspace" id="algorithm-lab">
          <aside className="setup-panel" aria-labelledby="setup-title">
            <p className="section-kicker">01 / SETUP</p><h2 id="setup-title">Set the scene</h2>
            <p className="muted setup-intro">Place riders and orders. Then watch each choice.</p>
            <label className="field-label" htmlFor="example">Example dataset</label>
            <select id="example" value={fixtureChoice} onChange={(event) => setFixtureChoice(event.target.value)}>
              {fixtures.map((fixture) => <option key={fixture.name} value={fixture.name}>{fixtureLabels[fixture.name] || fixture.name}</option>)}
            </select>
            <button className="button secondary full-width" onClick={() => load(fixtures.find((fixture) => fixture.name === fixtureChoice)!, fixtureLabels[fixtureChoice])}>Load Example Dataset</button>
            <details className="random-settings">
              <summary>Generate a random dataset</summary>
              <div className="random-counts"><label>Riders<input aria-label="Random rider count" type="number" min={2} max={8} value={randomRiders} onChange={(event) => setRandomRiders(event.target.value)} /></label>
                <label>Orders<input aria-label="Random order count" type="number" min={2} max={8} value={randomOrders} onChange={(event) => setRandomOrders(event.target.value)} /></label></div>
              <label className="field-label">Seed<input value={seed} inputMode="numeric" aria-label="Random seed" onChange={(event) => setSeed(event.target.value)} /></label>
              {!randomValid && <p className="field-error">Counts must be 2–8; seed must be an integer from 0 to 4294967295.</p>}
              <button className="button secondary full-width" disabled={!randomValid} onClick={() => load(randomDataset(Number(seed), Number(randomRiders), Number(randomOrders)), `Random · seed ${seed}`)}>Generate Random Dataset</button>
              <p className="small-note">Same seed and counts, same coordinates.</p>
            </details>
            <details className="coordinate-editor" open={editOpen} onToggle={(event) => setEditOpen(event.currentTarget.open)}>
              <summary>Edit riders &amp; orders <span>{riders.length} / {orders.length}</span></summary>
              <PointEditor group="riders" points={riders} errors={riderErrors} onChange={editRiders} />
              <PointEditor group="orders" points={orders} errors={orderErrors} onChange={editOrders} />
              <p className="small-note">Coordinates: −1000 to 1000. Negative values are valid. Each ID must be unique within its group.</p>
            </details>
            {(!riders.length || !orders.length) && <p className="inline-notice">At least one group is empty. No assignment can be made; total distance will be zero.</p>}
            {!valid && <p className="field-error">Correct the highlighted fields before starting.</p>}
            <p className="setup-footer">Editing inputs clears previous results and stops playback.</p>
          </aside>

          <div className="simulation-panel">
            <div className="simulation-heading"><div><p className="section-kicker">02 / SIMULATION</p><h2>Closest pair, one step at a time.</h2></div>
              <span className={`phase-badge phase-${state.phase}`} data-testid="phase" data-phase={state.phase}>{phaseLabels[state.phase]}</span></div>
            <div className="map-toolbar"><span className="dataset-name">{datasetName}</span>
              <div className="map-modes" role="group" aria-label="Map connection mode">
                {(['Greedy', 'Optimal', 'Both'] as const).map((mode) => <button key={mode} aria-pressed={mapMode === mode} disabled={mode !== 'Greedy' && !state.comparison} onClick={() => setMapMode(mode)}>{mode}</button>)}
              </div></div>
            <div className="map-frame"><CoordinateMap payload={mapPayload} assignments={assignments} optimal={state.comparison?.optimal.assignments || []} selected={step} mode={mapMode} />
              <div className="map-legend"><span><i className="legend-marker rider" />Rider</span><span><i className="legend-marker order" />Order</span>
                <span><i className="legend-line greedy" />Greedy</span><span><i className="legend-line optimal" />Optimal</span><span><i className="legend-halo" />Selected pair</span></div>
            </div>
            <div className="simulation-controls" id="simulation-controls" tabIndex={-1}>
              <div className="control-buttons">
                <button className="button primary" disabled={!valid || state.phase !== 'ready'} onClick={() => start(payload)}>{state.pending === 'greedy' ? 'Loading…' : 'Start'}</button>
                <button className="button secondary" disabled={!state.greedy || replayComplete || !['paused'].includes(state.phase)} onClick={next}>Next Step <span aria-hidden="true">→</span></button>
                <button className={`button ${state.phase === 'running' ? 'pause-button' : 'secondary'}`} disabled={!state.greedy || replayComplete || !['paused', 'running'].includes(state.phase)} onClick={togglePlayback}>{state.phase === 'running' ? 'Pause' : 'Run Automatically'}</button>
                <button className="button reset-button" onClick={invalidate}>Reset</button>
              </div>
              <div className="replay-progress"><span data-testid="step-count">Step {state.visibleSteps} / {state.greedy?.steps.length || Math.min(riders.length, orders.length)}</span>
                <progress aria-label="Greedy assignment replay" max={Math.max(1, state.greedy?.steps.length || Math.min(riders.length, orders.length))} value={state.visibleSteps} />
                <span>Total <strong data-testid="cumulative-total">{formatDistance(total)}</strong></span></div>
            </div>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
            {state.error && <div className="error-banner" role="alert"><div><strong>We couldn’t finish that request.</strong><p>{state.error}</p></div>
              <button className="button secondary" disabled={!valid} onClick={() => state.retry === 'optimal' ? findOptimal(payload) : start(payload)}>Retry</button></div>}
            <div className="step-grid">
              <section className="step-explanation" aria-labelledby="step-title"><p className="section-kicker">THE CURRENT CHOICE</p>
                <h3 id="step-title">{step ? <>{step.selected.riderId} <span className="arrow">→</span> {step.selected.orderId}</> : 'A local choice, made visible.'}</h3>
                {step ? <><p>C++ evaluated <strong>{step.candidates.length} available pairs</strong>. This pair has the smallest recorded distance: <strong>{formatDistance(step.selected.distance)} units</strong>.</p>
                  <p>Both {step.selected.riderId} and {step.selected.orderId} leave the available pool, so neither can be assigned again. The total is now <strong>{formatDistance(step.cumulativeTotal)}</strong>.</p>
                  <p className="small-note">{replayComplete ? 'Greedy replay complete. Compare with the global optimum below.' : 'Next Step reveals the next C++ decision. This table stays here until you advance.'}</p></>
                  : <p>{state.greedy && !state.greedy.steps.length ? state.greedy.explanation : 'Start computes the full trace in C++. Next Step reveals one recorded choice; automatic playback continues at a readable pace.'}</p>}
              </section>
              <CandidateTable step={step} />
            </div>
            <section className="assignment-section"><div className="subheading"><h3>Greedy assignments</h3><span>{assignments.length} committed / {Math.min(riders.length, orders.length)} pairs</span></div>
              <AssignmentTable assignments={assignments} label="Greedy assignments" />
              {replayComplete && state.greedy && <Unassigned result={state.greedy} label="Greedy" />}
            </section>
          </div>
        </div>

        <section className="comparison-section reveal" id="comparison" aria-labelledby="comparison-title">
          <div className="comparison-heading"><div><p className="section-kicker">03 / THE BIGGER PICTURE</p><h2 id="comparison-title">Can the total be smaller?</h2>
            <p className="muted">Compare the greedy choices with every feasible complete assignment.</p></div>
            <button className="button teal-button" disabled={!replayComplete || state.phase === 'loading' || !!state.comparison || state.phase === 'error'} onClick={() => findOptimal(payload)}>{state.pending === 'optimal' ? 'Searching all assignments…' : 'Find Optimal Assignment'}</button></div>
          {!replayComplete && <p className="small-note">Finish the greedy replay to enable exhaustive search.</p>}
          {state.comparison && comparison ? <div className="comparison-result" data-testid="comparison-result">
            <div className="comparison-totals">
              <div><span>Greedy total</span><strong className="indigo-text" data-testid="greedy-total">{formatDistance(state.comparison.greedy.totalDistance)}</strong><small>coordinate units</small></div>
              <div><span>Optimal total</span><strong className="teal-text" data-testid="optimal-total">{formatDistance(state.comparison.optimal.totalDistance)}</strong><small>coordinate units</small></div>
              <div><span>Absolute difference</span><strong data-testid="absolute-difference">{formatDistance(comparison.absoluteDifference)}</strong><small>coordinate units</small></div>
              <div><span>Greedy overhead</span><strong data-testid="greedy-overhead">{comparison.greedyOverheadPercent === null ? 'Undefined' : `${formatDistance(comparison.greedyOverheadPercent)}%`}</strong><small>relative to optimal</small></div>
            </div>
            <div className={`comparison-insight ${matched ? 'matched' : ''}`}><strong>{matched ? 'Greedy matched optimal for this dataset.' : 'The locally best choice did not produce the lowest total.'}</strong>
              <p>{matched ? 'This is one dataset, not a guarantee. Different coordinates can make greedy suboptimal.' : 'The first short pair can leave a costly pair for later. Exhaustive search considers the combined cost of every complete assignment.'}</p>
              {comparison.explanation && <p>{comparison.explanation}</p>}</div>
            <div className="optimal-grid"><div><div className="subheading"><h3>Optimal assignments</h3><span className="teal-text">Global minimum</span></div>
              <AssignmentTable assignments={state.comparison.optimal.assignments} label="Optimal assignments" />
              <Unassigned result={state.comparison.optimal} label="Optimal" /></div>
              <div className="search-evidence"><p className="section-kicker">DEPENDABLE COUNTS</p>
                <p><strong>{state.comparison.greedy.statistics.distanceEvaluations.toLocaleString()}</strong> greedy distance evaluations.</p>
                <p><strong data-testid="exhaustive-count">{state.comparison.optimal.statistics.completeAssignments.toLocaleString()}</strong> complete assignments evaluated by exhaustive search.</p>
                <p className="small-note">Global optimum means the minimum total Euclidean distance among assignments containing exactly min(R, O) pairs.</p>
              </div></div>
            <details className="timing-details"><summary>Timing &amp; what it measures</summary>
              <div className="timing-grid"><p><span>Greedy · C++ algorithm</span><strong data-testid="greedy-timing">{state.comparison.greedy.executionTimeMs.toFixed(3)} ms</strong></p>
                <p><span>Optimal · C++ algorithm</span><strong data-testid="optimal-timing">{state.comparison.optimal.executionTimeMs.toFixed(3)} ms</strong></p>
                <p><span>Compare · child process</span><strong>{state.comparison.timing.processElapsedMs.toFixed(3)} ms</strong></p>
                <p><span>Compare · browser request</span><strong>{state.compareRequestMs?.toFixed(3)} ms</strong></p></div>
              <p className="small-note">C++ timing surrounds only the algorithm call, including input validation. Process time includes startup and JSON; browser request time also includes HTTP. Timing is illustrative: tiny examples may show no visible speed difference. Operation counts are the dependable evidence of growth.</p>
            </details>
          </div> : <p className="comparison-preview">The initial counterexample is deliberately small: three riders, three orders, and a greedy choice that costs more in the end.</p>}
          <p className="limit-note">Small by design: at most 8 riders and 8 orders. Eight equal pairs have <strong>40,320</strong> complete assignments; ten would have <strong>3,628,800</strong>. Exhaustive search grows factorially.</p>
        </section>

        <section className="education-section reveal" id="how-it-works"><p className="section-kicker">04 / UNDERSTAND THE ALGORITHM</p>
          <h2>How It Works</h2>
          <div className="how-grid">
            <ol className="how-steps"><li><strong>Evaluate all available pairs.</strong><p>Measure straight-line Euclidean distance from every available rider to every available order.</p></li>
              <li><strong>Choose the shortest pair.</strong><p>This choice is locally optimal because no available pair has a smaller distance. Exact ties use the original rider index, then order index.</p></li>
              <li><strong>Commit and repeat.</strong><p>Remove both members from consideration, retain the recorded trace, and stop after min(R, O) assignments.</p></li>
              <li><strong>Check the global minimum.</strong><p>Exhaustive backtracking assigns each smaller-group member to every possible unused larger-group member. Every subset and arrangement is explored, with no pruning.</p></li></ol>
            <div className="code-panel"><div className="code-caption">GreedyAssignment.cpp <span>Actual C++17 source</span></div><pre><code>{snippet}</code></pre>
              <ol className="code-explanations"><li><code>euclideanDistance</code> evaluates a pair at full double precision.</li><li><code>push_back</code> records every candidate for this replay.</li><li><code>distance &lt; smallest</code> keeps the first exact tie in input order.</li></ol></div>
          </div>
        </section>
        <section className="algorithm-comparison reveal"><h2>Algorithm Comparison</h2>
          <div className="table-scroll"><table aria-label="Algorithm complexity comparison"><thead><tr><th>Property</th><th>Greedy</th><th>Exhaustive backtracking</th></tr></thead>
            <tbody><tr><th>Decision</th><td>Shortest currently available pair</td><td>Lowest total over all complete assignments</td></tr>
              <tr><th>Global optimality</th><td>No general guarantee</td><td>Yes, for this assignment model</td></tr>
              <tr><th>Time</th><td>O(R × O × min(R,O)); O(n³) when equal</td><td>O(n × n!) when equal, including loops and best copies</td></tr>
              <tr><th>Complete assignments</th><td>One greedy assignment</td><td>P(M,m) = M! / (M−m)!</td></tr>
              <tr><th>Auxiliary space</th><td>O(R+O)</td><td>O(R+O), including O(m) recursion</td></tr>
              <tr><th>Returned trace storage</th><td>Σ(R−k)(O−k) candidates; O(n³) when equal</td><td>No step trace; only the best assignment is kept</td></tr></tbody>
          </table></div>
          <p className="small-note">M = max(R,O), m = min(R,O). Trace sum runs from k=0 to m−1. Both algorithms also validate IDs in O(R log(R+1) + O log(O+1)) time. The source documentation derives exact recursive-loop and copying costs.</p>
          <div className="notes-grid"><article><h3>Why greedy can still be useful</h3><p>Its decisions are simple, deterministic, and easy to explain. Cubic work for equal groups grows more slowly than factorial search. It can be useful when quick, understandable assignments matter and a suboptimal total is acceptable.</p></article>
            <article><h3>The 7-versus-5 counterexample</h3><p>Greedy chooses R1→O1=1, R3→O3=1, then R2→O2=5: total 7. Swapping the first two riders’ order choices gives R1→O2=2, R2→O1=2, R3→O3=1: total 5. A saving now can create a larger cost later.</p></article>
            <article><h3>Assumptions &amp; limitations</h3><p>One order per rider, one rider per order, and min(R,O) pairs. Euclidean coordinates simplify geography. This simulation assigns riders to order locations; it does not model roads, delivery routes, restaurant pickups, traffic, or schedules.</p></article>
            <article><h3>What could follow</h3><p>Road-network distances, travel-time estimates, pickup locations, rider capacities, and scalable exact matching. Each changes the model and should be evaluated separately. This baseline keeps its unpruned exhaustive search for learning.</p></article></div>
        </section>
      </main>
      <footer><span>Food Delivery Rider Assignment · DAA project</span><span>React → Node → C++17 · Decisions computed in C++</span></footer>
    </div>
  </div>;
}
