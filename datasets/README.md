# Verified fixtures and test record

Each JSON file can be sent directly to the executable or bridge. IDs follow
coordinate order. `expected` values are test expectations, not algorithm input.
The compiled C++ suite loads and asserts all twelve files. It also checks each
fixture with an independent full-permutation oracle using separate distance
calculations.

Values below came from the compiled C++ executable, printed with 17 significant
digits. The four supplied fixture expectations were confirmed within 1e-10
absolute tolerance; the larger values were not used to compute the results.

| Dataset | Greedy total | Optimal total | Greedy distance evaluations | Complete exhaustive assignments |
| --- | ---: | ---: | ---: | ---: |
| `simple.json` | 3 | 3 | 14 | 6 |
| `greedy_failure.json` | 7 | 5 | 14 | 6 |
| `unequal_counts.json` | 2 | 2 | 8 | 6 |
| `larger_fixed.json` | 30.605384854352774 | 23.077520809352354 | 91 | 720 |
| `empty_both.json` | 0 | 0 | 0 | 1 |
| `empty_riders.json` | 0 | 0 | 0 | 1 |
| `empty_orders.json` | 0 | 0 | 0 | 1 |
| `more_orders.json` | 2 | 2 | 8 | 6 |
| `negative_coordinates.json` | 2 | 2 | 5 | 2 |
| `coincident_zero.json` | 0 | 0 | 5 | 2 |
| `deterministic_ties.json` | 2 | 2 | 5 | 2 |
| `precision_near_tie.json` | 1 | 1 | 2 | 2 |

`unequal_counts` leaves R3 unassigned. `more_orders` leaves O1 unassigned,
demonstrating that both algorithms can choose a subset beyond the first m
larger-group members. `precision_near_tie` chooses O2 at distance 1 rather
than O1 at 1.0000000000005, verifying that distances are not rounded into ties.
The empty assignment is one complete exhaustive leaf, hence the count of 1
for empty-group datasets.

The counterexample's asserted greedy sequence is R1→O1=1, R3→O3=1,
R2→O2=5. The asserted optimal assignment is R1→O2=2, R2→O1=2, R3→O3=1.
The difference is 2 and greedy overhead is 40%.

## Sprint 1 verification (historical record)

Executed on 7 October 2026 using AppleClang 21.0.0, C++17, CMake 4.1.2,
and Node 20.20.2:

```sh
cmake -S backend -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build -j 4
ctest --test-dir build --output-on-failure
./build/algorithm_tests datasets
```

The build completed with the enabled warning flags. Both registered CTest
suites passed: `algorithm_tests` and `json_and_bridge_tests` (2/2).
The C++ suite checked **216 valid cases**, consisting of 12 stored fixtures,
200 deterministic generated cases (seed 20261007, every R/O size from 0 to 4,
eight samples per size pair), and four targeted cases. It additionally checked
invalid IDs, nonfinite coordinates, and distance/total overflow.

Every valid case checks assignment uniqueness/cardinality, exact unassigned
complements in input order, distances/totals, complete greedy candidate traces,
tie behavior, optimal ≤ greedy within tolerance, permutation-oracle agreement,
and exhaustive counters. Formula checks for every recursive call, candidate
loop, accepted edge, and complete leaf help detect missed subsets or pruning.
The JSON/HTTP suite ran **7 Node test groups**, including all persisted fixtures,
request modes, malformed/schema/size errors, exhaustive admission limits,
Unicode and precision, real HTTP→C++ responses, and missing-executable handling.

The first restricted CTest run passed the C++ suite and five JSON-only test
groups but could not open localhost for the two HTTP groups (`listen EPERM`).
After rerunning with localhost permission, both HTTP groups and the full
CTest run passed. No HTTP test was treated as passing during the restricted run.

An additional AddressSanitizer + UndefinedBehaviorSanitizer build was compiled
and executed:

```sh
cmake -S backend -B build-sanitized -DCMAKE_BUILD_TYPE=Debug -DENABLE_SANITIZERS=ON
cmake --build build-sanitized -j 4
./build-sanitized/algorithm_tests datasets
ctest --test-dir build-sanitized --output-on-failure
```

All 216 valid C++ cases and invalid-input checks passed under sanitizers.
Both sanitizer CTest suites passed (2/2), including all seven Node test groups
against the sanitizer-built executable. No address or undefined-behavior
diagnostics were reported. HTTP checks again ran with localhost permission.

## Final prototype verification — 8 October 2026

The completed backend and frontend were verified with AppleClang 21.0.0,
CMake 4.1.2, Node 20.20.2, and installed Google Chrome through Playwright
1.63.0. These results supersede the historical seven-group HTTP suite above.

| Executed check | Observed result |
| --- | --- |
| Clean `npm ci` using the populated offline npm cache | Passed; lockfile installation completed |
| `npm run build` | C++17 Release build, TypeScript check, and Vite production build passed |
| `npm run test:cpp` | 216 valid cases plus invalid-input checks passed |
| `npm run test:api` | All 14 CLI/real HTTP test groups passed; none skipped |
| `npm test` | Both CTest suites passed (2/2) |
| Debug AddressSanitizer + UndefinedBehaviorSanitizer build and CTest | Build and both suites passed (2/2); no sanitizer diagnostics |
| `npm run test:browser -- --max-failures=1` | All 28 browser tests passed against the production frontend and real API; retries disabled |

HTTP tests send all twelve fixtures through greedy, optimal, and compare
endpoints. They exercise independent Node/C++ validation, malformed JSON,
request limits, missing/crashing/timed-out children, invalid/incomplete/null
child responses, controlled concurrency, and recovery. Three repeated
eight-by-eight coincident searches verify deterministic ties, 204 greedy
distance evaluations, 40,320 exhaustive leaves, and zero overhead.

Browser tests cover every predefined dataset, the full 7/5/40% presentation
flow, selections matching the actual C++ trace, one rider/order consumed per
step, unequal/empty groups, input invalidation, reset/pause, slow stale responses,
failed-request retry, reproducible seeds, and the eight-member cap. Layouts were
checked at 320×740, 390×844, 820×1180, and 1440×1000 with negative coordinates,
equal axis scale, label bounds, and no horizontal page overflow. Sixteen
coincident labels were checked for overlap on mobile. Screenshots were inspected.
Keyboard focus, reduced motion, one polite current-step announcement, and
always-visible content without IntersectionObserver were verified.

An earlier browser run timed out during the mobile-small test and left six
tests unrun. That run was not counted as passing. The affected test and the
new response-recovery test passed in a focused rerun, followed by the final
complete 28/28 run above.

Saved screenshots in `docs/screenshots/` show the actual tested prototype.
Algorithm, child-process, and browser timings are separate and illustrative;
no language-speed claim is drawn from the tiny example. Other browser engines,
real mobile devices, and screen-reader combinations have not been verified.
The clean install used cached packages, so a fresh online installation on a
different machine remains for that machine's setup check.
