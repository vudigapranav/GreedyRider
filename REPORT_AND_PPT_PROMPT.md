# Ready-to-send prompt: project report and PPT

Copy everything below into your friend's AI assistant after sharing the Git
repository. Fill the repository URL when available. Academic details may be
filled by your friend later; unknown details must remain blank.

---

You are preparing the final academic project report and PowerPoint presentation
for our college Design and Analysis of Algorithms project:

**Food Delivery Rider Assignment Based on Minimum Distance**

Use the working project in the repository below as your source of truth. Inspect
the implementation, documentation, tests, and verified datasets before writing.
Produce polished, editable deliverables that we can submit and present. Preserve
the existing code and architecture. This is a documentation task.

## Details to fill in

Leave these fields blank until we supply them. Do not invent names, registration
numbers, college details, signatures, approvals, or logos. Keep the same fields
editable in the report and PPT.

- Repository URL: ______________________________
- Repository branch or commit, if specified: ______________________________
- College/institution: ______________________________
- University/affiliation: ______________________________
- Department: ______________________________
- Degree/program: ______________________________
- Course name: ______________________________
- Course code: ______________________________
- Academic year: ______________________________
- Year and semester: ______________________________
- Section/batch: ______________________________
- Faculty/course instructor: ______________________________
- Project guide, if different: ______________________________
- Head of department, if required: ______________________________
- Submission date: ______________________________

| Team member name | Registration/roll number | Contribution, if supplied |
| --- | --- | --- |
| ____________________ | ____________________ | ____________________ |
| ____________________ | ____________________ | ____________________ |
| ____________________ | ____________________ | ____________________ |
| ____________________ | ____________________ | ____________________ |

Add or remove team rows when the actual team size is known. An official college
template, if supplied, takes precedence over the suggested formatting below.

## Repository inspection and verification

Clone the supplied repository, or use the provided checkout. Use the specified
branch/commit if supplied; otherwise record the checked-out commit. Read:

- `README.md`, `ALGORITHM.md`, and `datasets/README.md`.
- `backend/Rider.h`, `Order.h`, `Assignment.h`, and `Distance.cpp`.
- `backend/GreedyAssignment.cpp` and `OptimalAssignment.cpp`.
- `backend/JsonProtocol.cpp`, `main.cpp`, and `CMakeLists.txt`.
- `bridge/server.mjs` and `backend/third_party/README.md`.
- `frontend/src/App.tsx`, `CoordinateMap.tsx`, and `useSimulation.ts`.
- `backend/tests/AlgorithmTests.cpp`, `IntegrationTests.mjs`, and
  `tests/browser/lab.spec.ts`.
- All JSON fixtures in `datasets/` and screenshots in `docs/screenshots/`.

Prerequisites are Node 20.19+ in the 20.x line or 22.12+, npm, CMake 3.16+,
and a C++17 compiler. From the project root:

```sh
npm ci
npm run build
npm test
npm run test:browser
```

If no compatible Chrome/Chromium is available, follow README and install
Playwright Chromium with `npx playwright install chromium`.
To demonstrate the application, run `npm run dev:api` in one terminal and
`npm run dev` in another, then open `http://127.0.0.1:5173/`.

The project's final recorded verification includes 216 valid C++ cases plus
invalid-input checks, 14 CLI/HTTP test groups, and 28 browser tests, all passing;
Release and sanitizer CTest each passed 2/2 suites, and the production build
passed. Distinguish these recorded results from tests you personally rerun.
If your environment cannot run something, disclose it; do not claim it passed.

## Technical facts that must be represented accurately

1. The objective is minimum **total Euclidean distance** among feasible
   assignments containing exactly `min(R,O)` pairs. Each rider/order appears
   at most once. Unmatched members of the larger group are returned explicitly.
2. Riders/orders have string IDs and double X/Y coordinates. Distance uses
   `std::hypot` and full available double precision. Only display formatting
   rounds values; comparisons and summation do not.
3. Greedy scans every currently available rider–order pair, chooses the
   smallest distance, assigns that pair, and removes both entities. Exact
   ties use original rider index, then original order index.
4. The choice is locally best because no available pair is shorter. It has
   no global guarantee because removing endpoints can force costly later pairs.
5. Exhaustive backtracking assigns each smaller-group member to an unused
   larger-group member. It covers all subsets and arrangements of the larger
   group, accumulates distance recursively, and keeps the least-total complete
   assignment. It uses no Hungarian matching or branch-and-bound pruning.
6. Architecture is React + Vite + TypeScript → built-in Node HTTP bridge →
   precompiled C++17 executable using JSON stdin/stdout. Algorithms are
   independent of JSON/HTTP. No assignment algorithm is implemented in JS.
   The pinned C++ parser is vendored nlohmann/json 3.12.0.
7. The API provides `GET /api/health` and `POST /api/greedy`, `/api/optimal`,
   `/api/compare`. Node and C++ independently validate at most eight riders
   and eight orders, group-unique text IDs, and finite coordinates in
   `[−1000,1000]`. Empty arrays and negative coordinates are valid.
8. Greedy trace includes every available candidate, selected pair, and
   cumulative total. The frontend replays that trace; it does not recalculate
   assignment choices. Input edits and Reset invalidate results and cancel
   playback; obsolete responses are ignored.
9. Greedy time is `O(R × O × min(R,O))`, or `O(n³)` for equal groups. Its
   auxiliary memory is `O(R+O)`, while the returned candidate trace stores
   `Σ(k=0..m−1)(R−k)(O−k)` entries, `O(n³)` for equal groups. Discuss trace
   storage separately from working memory.
10. Exhaustive leaves are `P(M,m)=M!/(M−m)!`, where `M=max(R,O)` and
    `m=min(R,O)`. Explain the recursive candidate loops and copying the best
    assignment, using ALGORITHM.md's exact derivation. Equal-size runtime is
    `O(n × n!)`; auxiliary memory is `O(R+O)` including recursion. Do not
    equate counting `n!` leaves with the entire implementation cost.
11. Eight equal pairs produce 40,320 complete assignments and 204 greedy
    distance evaluations. Ten equal pairs would produce 3,628,800 complete
    assignments and are outside the interface limit.
12. Overhead is `100 × (greedyTotal−optimalTotal)/optimalTotal`. Both totals
    zero gives 0%; a zero optimal total with a nonzero greedy total gives a
    null percentage and explanation. No NaN or Infinity is returned.
13. Algorithm timing is separate from child-process and HTTP/browser time.
    Timings are illustrative; operation counts demonstrate growth reliably.
    Do not claim C++ is faster from a single tiny end-to-end request or invent
    benchmark measurements.
14. Euclidean distance is a simplified flat-plane geographic model. The
    prototype assigns riders to order locations without roads, delivery
    routes, restaurant pickups, traffic, capacities, or scheduling.

## Mandatory verified results and counterexample

| Dataset | Greedy total | Optimal total | Key observation |
| --- | ---: | ---: | --- |
| Simple | 3 | 3 | Matches optimal for this dataset only |
| Greedy failure | 7 | 5 | Difference 2; overhead 40% |
| Unequal counts | 2 | 2 | R3 unassigned |
| Larger fixed | 30.605384854352774 | 23.077520809352354 | Six pairs; 720 exhaustive leaves |

Show the complete counterexample, including coordinates and distance table:

- Riders: R1=(0,0), R2=(3,0), R3=(20,0).
- Orders: O1=(1,0), O2=(−2,0), O3=(20,1).
- Greedy: R1→O1=1, R3→O3=1, R2→O2=5; total 7.
- Optimal: R1→O2=2, R2→O1=2, R3→O3=1; total 5.
- Explain the initial distance-1 tie and input-index resolution.
- Explain how taking distance 1 first leaves a distance-5 pair, while two
  distance-2 pairs reduce the combined total.
- Greedy evaluates 9+4+1=14 distances; exhaustive covers 3!=6 assignments.

Discuss the remaining stored fixtures: empty groups, more orders, negative
coordinates, coincident/zero distances, deterministic ties, and a near tie
that tests full-precision comparisons. Report no fabricated experiments.

## Deliverable 1: academic report

Create an editable `Project_Report.docx` and matching `Project_Report.pdf`.
Aim for approximately 18–25 substantive pages including front matter, adjusting
to a supplied college template. Avoid padding, repeated explanations, or
unrelated background. Use consistent headings, page numbers, a generated table
of contents, numbered figures/tables, captions, readable equations, and short
code excerpts. Use a restrained academic style and clear student-level language.

Suggested order:

1. Title page with the blank academic/team fields.
2. Declaration and certificate pages only if the college requires them;
   leave signatures, dates, and approval fields blank.
3. Acknowledgement with editable names; do not imply an approval was obtained.
4. Abstract, table of contents, and list of figures/tables where useful.
5. Introduction, problem statement, objective, and project scope.
6. Proposed greedy solution and why it is useful despite its limitation.
7. Mathematical model, assumptions, distance formula, and data structures.
8. System architecture and request/data flow diagram.
9. Greedy pseudocode, implementation explanations, and local-choice reasoning.
10. Exhaustive pseudocode, correctness argument, unequal-group handling, and
    deterministic behavior.
11. Time/space complexity derivation, exact operation counts, trace costs,
    and factorial growth table.
12. Implementation: C++ core, JSON boundary, Node bridge, API validation and
    failure handling, and frontend replay/cancellation flow.
13. Verified 7-versus-5 walkthrough with coordinate diagrams and calculations.
14. Testing methodology, independent permutation oracle, dataset results,
    integration/browser checks, and honest verification limits.
15. Actual prototype screenshots with captions and a short demonstration flow.
16. Discussion: when greedy helps, limitations, and possible improvements.
17. Conclusion, references, and appendix with setup commands/sample API JSON.

Use actual repository code, not invented snippets. Explain key decisions rather
than pasting entire source files. Cite repository paths for implementation
evidence. Use verified primary documentation or established academic references
for external claims; verify bibliographic details instead of inventing citations.

## Deliverable 2: presentation

Create an editable `Project_Presentation.pptx`, approximately 14 slides, with
speaker notes for a 7–10 minute student presentation. Use large readable text,
short bullets, clean diagrams, and genuine prototype screenshots. Match the
prototype's warm off-white, dark text, indigo riders, orange orders, and teal
optimal connections. Use shapes and labels as well as color.

Suggested slide sequence:

1. Title and blank team/faculty/college fields.
2. Problem and objective: exactly min(R,O) distinct pairs, minimum total distance.
3. Model, Euclidean distance, assumptions, and scope.
4. Architecture: frontend → Node → C++ → response/trace.
5. Greedy choice and concise pseudocode.
6. Stepwise greedy counterexample: 1+1+5=7.
7. Exhaustive assignment: 2+2+1=5; why all feasible assignments are covered.
8. Comparison: 7 versus 5, difference 2, overhead 40%.
9. Complexity, trace memory, counts, and factorial growth.
10. Working prototype: map, replay controls, candidate table, and comparison.
11. Verified datasets and tests, with timing interpretation.
12. Benefits, limitations, and where greedy remains useful.
13. Future enhancements and conclusion.
14. Live demonstration sequence / questions.

The live demonstration should follow README: failure dataset → Start → Next
Step → automatic playback → Find Optimal Assignment → Greedy/Optimal/Both
map modes → unequal counts or simple dataset → input edit/Reset. Include a
short screenshot-based fallback if the live backend is unavailable.

## Final quality check and handoff

Ensure the report and slides consistently answer what is optimized, what the
greedy choice is, why it is locally best, why global optimality can fail, how
the counterexample proves it, how exhaustive search covers every feasible
assignment, both time/space costs, why greedy is useful, the assumptions and
limitations, and realistic next improvements.

Render and inspect the report PDF and all slides for clipping, layout, font
size, equations, labels, and consistency. Keep every unknown academic field
blank and editable. Deliver the DOCX, PDF, PPTX, and a short list of anything
still requiring our details or verification. Do not modify project algorithms,
push Git changes, deploy the application, or fabricate screenshots/results.
