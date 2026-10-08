# Rider assignment algorithms

## Model and architecture

For R riders and O orders, assign exactly m = min(R,O) rider–order pairs.
Each rider and each order can occur at most once. The objective is the sum of
the distances of these pairs. Unmatched members of the larger group are returned
in their original input order. There are no priorities, capacities greater than
one, or constraints forbidding particular pairs.

The implemented local application has three layers:

```text
React + Vite + TypeScript frontend
    -> JSON HTTP request
Lightweight Node bridge: /api/greedy, /api/optimal, /api/compare
    -> JSON stdin, EOF
C++17 executable: JSON adapter -> independent algorithm library
    -> JSON stdout
Node bridge -> JSON HTTP response -> frontend
```

The bridge starts one executable per request. Algorithms accept C++ vectors and
return a `Result`; they do not include JSON, HTTP, or process-management code.
`JsonProtocol.cpp` handles parsing, serialization, request modes, and interface
limits. `main.cpp` handles standard input/output. The algorithm library can be
used directly without the bridge or the JSON dependency.

## Data structures

| Struct | Fields and purpose |
| --- | --- |
| `Rider` | String `id`, double `x`, double `y` |
| `Order` | String `id`, double `x`, double `y` |
| `Assignment` | `riderId`, `orderId`, double `distance` |
| `CandidatePair` | Original zero-based rider/order indices and an `Assignment` |
| `GreedyStep` | One-based iteration, all candidates, selected candidate, cumulative total |
| `AlgorithmStatistics` | Distance evaluations, complete assignments, recursive calls, candidate checks, best updates, copied best-assignment entries |
| `Result` | Assignments, total, separate unassigned ID lists, statistics, greedy steps |

Vectors preserve input order. Boolean vectors mark used members. IDs must be
nonempty and unique within each group; a rider and order may share an ID because
they belong to separate groups. Fixtures use R1, R2, … and O1, O2, … in coordinate
order. The algorithms accept other IDs and never sort by ID.

The distance is

```text
d(r,o) = sqrt((r.x - o.x)^2 + (r.y - o.y)^2).
```

The implementation uses `std::hypot(dx,dy)` for stable Euclidean distance, then
ordinary double addition for totals. It never rounds before comparison or
summation, and JSON serialization preserves double values. Human-readable tables
may show fewer digits. “Full precision” here means the available precision of
IEEE floating-point `double`, not exact real arithmetic. Nonfinite coordinates,
unrepresentable pair distances, and encountered total overflows cause errors.

## Greedy algorithm

```text
validate inputs
usedRiders = all false; usedOrders = all false
total = 0
for iteration = 1 to min(R,O):
    candidates = empty
    smallest = infinity
    for riderIndex = 0 to R-1:
        if rider is used: continue
        for orderIndex = 0 to O-1:
            if order is used: continue
            distance = Euclidean(rider, order)
            count this distance evaluation
            append pair, indices, and distance to candidates
            if distance < smallest:
                smallest = distance
                selected = this pair
    mark selected rider and order used
    append selected assignment
    total += smallest
    append step(iteration, candidates, selected, total)
return assignments, total, unused IDs, statistics, steps
```

Iteration scans original rider indices, then original order indices. A strict
`<` comparison keeps the first candidate when distances are exactly equal.
Thus ties use original rider index first, then original order index. An epsilon
is not used to turn nearby unequal distances into ties.

Every selected pair is the locally shortest available pair. This does not
account for the alternatives lost when both endpoints are removed. The combined
cost of later pairs can outweigh the saving made now, so there is no global
optimality guarantee.

The trace is produced during the C++ execution. The frontend replays
the recorded candidates and selection without recalculating or approximating
the greedy decisions.

## Exhaustive backtracking

Choose riders as the smaller group when R <= O, and orders otherwise. Fix the
smaller group's input order. At depth k, assign its kth member to one unused
member of the larger group.

```text
bestTotal = infinity
current = empty; usedLarger = all false

visit(depth, total):
    count recursive call
    if depth == m:
        count complete assignment
        if total < bestTotal:
            bestTotal = total
            copy current assignment and larger-group indices to best
        return

    for largerIndex = 0 to M-1:
        count candidate check, including already-used members
        if usedLarger[largerIndex]: continue
        choose rider/order indices according to which group is smaller
        distance = Euclidean(rider, order)
        count distance evaluation
        mark largerIndex used; append pair and index to current
        visit(depth + 1, total + distance)
        remove current pair and index; mark largerIndex unused

visit(0, 0)
return best and the complement of its assigned larger-group indices
```

The running total is passed by value. Undoing a branch removes its assignment;
there is no subtraction from a shared total that could accumulate cancellation
error. Equal complete totals retain the first encountered assignment. The
exhaustive pair output follows smaller-group order and need not have the same
order as the greedy sequence.

There is no Hungarian method, substitute optimizer, partial-cost pruning, or
branch-and-bound. A branch is explored even when its partial total exceeds the
current best. JSON interface admission limits reject an entire oversized
request before search; they do not prune accepted searches.

At depth k there are M-k unused choices. Every injection from the smaller group
into the larger group therefore corresponds to exactly one root-to-leaf path.
No path repeats a larger-group member, and every valid cardinality-m assignment
has a path. Taking the lowest total over all these leaves proves global
optimality for this model, subject to floating-point representation and input
validation. For m=0 there is exactly one complete assignment: the empty one.

## Exact work and complexity

Let M=max(R,O), m=min(R,O), and P(M,0)=1. Complexity counts struct entries and
arithmetic operations with bounded ID lengths. Copying/comparing long IDs also
costs time proportional to their lengths.

Both public algorithms validate IDs using ordered sets. This adds
V = O(R log(R+1) + O log(O+1)) time and O(R+O) temporary storage.
Result reconstruction is O(R+O). These costs matter for empty groups, where no
distance evaluations take place.

### Greedy

The exact number of distance evaluations and stored candidate entries is

```text
Dg = sum(k=0..m-1) (R-k)(O-k)
   = mRO - (R+O)m(m-1)/2 + m(m-1)(2m-1)/6.
```

The code still scans used indices: its outer rider loop has mR index visits,
and its inner order loop has O * sum(k=0..m-1)(R-k) index visits. Only available
pairs evaluate distance. There are m selected assignments and m step records.
Candidate entries are appended once; the completed step vector is moved into
the result rather than copied. Overall algorithm time is
O(R × O × min(R,O)) for nonempty groups, plus V and O(R+O) validation/output work.
Equal groups of size n have O(n³) time.

### Exhaustive

The number of complete assignments is exactly

```text
L = P(M,m) = M! / (M-m)!.
```

This counts subsets and arrangements of the larger group: choose m distinct
members, then arrange them for the fixed smaller-group order. It is m! only
when both groups have size m.

Let Nk=P(M,k), N=sum(k=0..m)Nk, I=sum(k=0..m-1)Nk, and U be the number of
strict improvements to the best assignment. This implementation has:

| Work | Exact count |
| --- | --- |
| Recursive calls | N |
| Complete assignments | L |
| Larger-group loop checks, including used members | M × I |
| Accepted recursive edges / distance evaluations / running-total additions | N-1 |
| Best assignment updates | U, with 1 <= U <= L |
| Assignment entries copied on best updates | m × U |
| Larger-group index entries copied on best updates | m × U |

Push/pop and used-flag updates occur on every accepted edge. Checking a leaf
and its total is constant work. Each improving leaf copies m assignments and
m indices. Reconstructing unassigned members and returning the result add
O(R+O+m) work. Therefore time is
O(V + R+O + M×I + N + m×U).

For R=O=n, N=Theta(n!), I=Theta(n!) for positive n, and U <= n!. Scanning n
candidates at every internal node gives an O(n × n!) bound (indeed Theta(n × n!)
for these loops). Copying n assignments at as many as n! improving leaves also
fits O(n × n!). An implementation that unconditionally copies at every leaf
has that copying bound too; this implementation copies only on improvement.
It would be incomplete to describe this implementation's total work as only
O(n!) by counting leaves alone.

### Auxiliary memory and returned storage

- Greedy uses O(R+O) auxiliary storage for validation and used flags. Its
  returned assignments/unassigned IDs take O(R+O), while returned step storage
  is Theta(Dg+m) entries, including every candidate and each selected pair.
  The current step's candidate vector is output under construction and becomes
  returned trace storage by move; it is not an additional copy of the trace.
  Total memory including trace is O(R+O+Dg+m), O(n³) for equal groups.
- Exhaustive uses O(M+m) search storage: M used flags, an O(m) recursion stack,
  current assignments, current indices, and best indices. Validation adds
  O(R+O) temporary storage. Thus auxiliary memory is O(R+O), excluding the
  O(R+O) returned assignments and unassigned IDs. Leaves are counted, not
  stored; the permutation oracle's test-only memory is not algorithm memory.
- JSON serialization and the Node bridge buffer the response in addition to
  these C++ costs. Their storage is proportional to the serialized result,
  including the trace. These adapter costs are separate from algorithm space.

## Verified 7-versus-5 walkthrough

Riders: R1=(0,0), R2=(3,0), R3=(20,0).
Orders: O1=(1,0), O2=(-2,0), O3=(20,1).

Initial distances (displayed to six decimal places only):

| | O1 | O2 | O3 |
| --- | ---: | ---: | ---: |
| R1 | 1 | 2 | 20.024984 |
| R2 | 2 | 5 | 17.029386 |
| R3 | 19 | 22 | 1 |

1. R1→O1 and R3→O3 both have distance 1. Original rider index chooses R1→O1.
   Cumulative total: 1. Nine candidates were evaluated.
2. With R1 and O1 removed, R3→O3 is shortest at 1. Cumulative total: 2.
   Four candidates were evaluated.
3. Only R2→O2 remains, at distance 5. Total: **7**. One candidate was evaluated.

Exhaustive search evaluates all 3!=6 complete assignments. Its best is
R1→O2=2, R2→O1=2, R3→O3=1, totaling **5**. Giving O1 to R2 and O2 to R1
costs 4, whereas greedy's choices for those two riders cost 6. The difference
is 7-5=**2**, and greedy overhead is (7-5)/5×100=**40%**.

The compiled tests assert these assignments, the 14 greedy distance
evaluations, six exhaustive leaves, difference, and percentage. They also
verify the larger fixture and compare exhaustive results with an independent
permutation-based oracle.

## Important C++ code decisions

The frontend displays an excerpt imported directly from
`backend/GreedyAssignment.cpp` at build time. It is not a JavaScript
reimplementation or a manually maintained imitation:

```cpp
const double distance = euclideanDistance(riders[r], orders[o]);
++result.statistics.distanceEvaluations;
++result.statistics.candidateChecks;
CandidatePair candidate{r, o, {riders[r].id, orders[o].id, distance}};
step.candidates.push_back(candidate);

// Strict comparison retains the first exact tie encountered:
// original rider index first, then original order index.
if (distance < smallest) {
    smallest = distance;
    step.selected = candidate;
}
```

1. `euclideanDistance` computes the full-precision Euclidean distance of the
   current available pair. Used members have already been skipped by the
   enclosing original-index loops. The distance-evaluation counter increments
   once per actual computation, not for skipped members.
2. `step.candidates.push_back` records every available candidate before
   selection. The browser highlights the selected pair from this trace and
   commits the corresponding recorded assignment; it never chooses a minimum.
3. Strict `distance < smallest` retains the first exact tie. Rider indices are
   scanned first, then order indices, which makes the result deterministic.
4. After the scan, both used flags are set, the assignment is appended, and
   `addDistance` accumulates its unrounded distance. The step captures the
   running total, and `std::move(step)` transfers the trace into the result.

The exhaustive implementation's central recursive call is:

```cpp
visit(depth + 1, addDistance(total, distance));
```

The selected larger-group member is marked and the pair pushed before the
call; both are undone afterward. Depth identifies the next smaller-group
member. The leaf increments `completeAssignments` regardless of whether its
total improves the best. Only a strict improvement copies the current
assignments and larger-group indices. No condition on the partial total skips
an otherwise feasible branch.

## Boundary, replay, and timing

JSON and HTTP are outside the core algorithms. Independently at the Node API
and C++ JSON boundary, requests require both arrays, at most eight members per
group, nonempty unique IDs within each group (maximum 32 UTF-8 bytes), finite
coordinates in [−1000,1000], and at most 64 KiB input. Empty groups are valid.
These are whole-request admission rules, not exhaustive search pruning.
Core functions retain the Sprint 1 behavior without these interface size/range
limits. Accepted eight-by-eight searches visit all 40,320 complete assignments.

The CLI reads one JSON request until EOF and emits one JSON response. Errors
have a code/message envelope and diagnostics use stderr. Node launches the
precompiled executable with `execFile`, never a shell. It allows two concurrent
processes, rejects extra work with 503, and terminates timed-out children.

The frontend's explicit flow is ready → loading → paused at step zero, then
paused/running → complete; failed requests enter error with a retry action.
Input changes and Reset return to ready, abort outstanding requests, increase
a generation token, and cancel timers. Responses from an older token are
ignored even if cancellation arrives too late. Optimal search is enabled only
after the greedy replay completes. The candidate table retains the current
recorded step until advancement. Map geometry uses equal pixel scale on X/Y;
geometry and display formatting do not make assignment decisions.

`executionTimeMs` uses `steady_clock` only around the C++ algorithm call. It
includes core validation and trace construction, excludes JSON/process/HTTP,
and is stored outside core `Result` statistics. Node process/server timings and
the browser's request timing are distinct. Tiny single-run timings are
illustrative and cannot establish a language speed advantage. Operation counts
and complete-assignment counts give reproducible evidence of growth.

Compare reports absolute distance difference and the unrounded formula
`100 * (greedyTotal - optimalTotal) / optimalTotal`. When both totals are zero,
it returns zero overhead and an explanation. If only the optimal total is zero,
it returns a null percentage and explains that division by zero is undefined.
No NaN or Infinity is exposed. Display-only rounding never affects the search.

## Model limitations

Euclidean distance is a simplified geographic model. Coordinates represent a
flat plane in a common unit. This prototype assigns riders to order locations
without modeling roads or delivery routes. It does not model traffic, travel
time, restaurant pickup, multi-stop delivery, rider availability schedules,
service priorities, geographic latitude/longitude conversion, or multiple
orders per rider. Exhaustive search grows factorially and is intended for
small educational examples. Greedy scales better but can be suboptimal.
