#include "Distance.h"
#include "GreedyAssignment.h"
#include "JsonProtocol.h"
#include "OptimalAssignment.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <numeric>
#include <random>
#include <set>
#include <stdexcept>

namespace {
std::size_t checkedCases = 0;

// Throwing checks remain active in Release builds, unlike the assert macro.
void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}

bool near(double a, double b, double tolerance = 1e-10) {
    return std::isfinite(a) && std::isfinite(b)
        && std::abs(a - b) <= tolerance * std::max({1.0, std::abs(a), std::abs(b)});
}

// Independent of the production Distance.cpp implementation.
double referenceDistance(const Rider& rider, const Order& order) {
    const double dx = rider.x - order.x;
    const double dy = rider.y - order.y;
    return std::sqrt(dx * dx + dy * dy);
}

std::uint64_t permutations(std::size_t larger, std::size_t smaller) {
    std::uint64_t count = 1;
    for (std::size_t k = 0; k < smaller; ++k) count *= larger - k;
    return count;
}

struct OracleResult {
    double total = std::numeric_limits<double>::infinity();
    std::uint64_t count = 0;
};

OracleResult permutationOracle(const std::vector<Rider>& riders, const std::vector<Order>& orders) {
    const std::size_t smaller = std::min(riders.size(), orders.size());
    const std::size_t larger = std::max(riders.size(), orders.size());
    std::vector<std::size_t> permutation(larger);
    std::iota(permutation.begin(), permutation.end(), 0);
    std::set<std::vector<std::size_t>> prefixes;
    OracleResult result;
    // Enumerate full permutations, independently of production backtracking.
    // Only the first m indices are assigned; deduplicate unused suffix orders.
    do {
        std::vector<std::size_t> prefix(permutation.begin(), permutation.begin() + smaller);
        if (!prefixes.insert(prefix).second) continue;
        double total = 0.0;
        for (std::size_t k = 0; k < smaller; ++k) {
            if (riders.size() <= orders.size()) {
                total += referenceDistance(riders[k], orders[prefix[k]]);
            } else {
                total += referenceDistance(riders[prefix[k]], orders[k]);
            }
        }
        ++result.count;
        result.total = std::min(result.total, total);
    } while (std::next_permutation(permutation.begin(), permutation.end()));
    return result;
}

void validateResult(const std::vector<Rider>& riders, const std::vector<Order>& orders, const Result& result) {
    require(result.assignments.size() == std::min(riders.size(), orders.size()), "Assignment count");
    std::set<std::string> usedRiders;
    std::set<std::string> usedOrders;
    double total = 0.0;
    for (const Assignment& assignment : result.assignments) {
        const auto r = std::find_if(riders.begin(), riders.end(), [&](const Rider& rider) {
            return rider.id == assignment.riderId;
        });
        const auto o = std::find_if(orders.begin(), orders.end(), [&](const Order& order) {
            return order.id == assignment.orderId;
        });
        require(r != riders.end() && o != orders.end(), "Unknown assigned ID");
        require(usedRiders.insert(assignment.riderId).second, "Rider assigned twice");
        require(usedOrders.insert(assignment.orderId).second, "Order assigned twice");
        require(near(assignment.distance, referenceDistance(*r, *o)), "Incorrect pair distance");
        total += assignment.distance;
    }
    require(near(total, result.totalDistance), "Incorrect total");
    std::vector<std::string> leftoverRiders;
    std::vector<std::string> leftoverOrders;
    for (const Rider& rider : riders) {
        if (!usedRiders.count(rider.id)) leftoverRiders.push_back(rider.id);
    }
    for (const Order& order : orders) {
        if (!usedOrders.count(order.id)) leftoverOrders.push_back(order.id);
    }
    require(result.unassignedRiderIds == leftoverRiders, "Incorrect unassigned riders or order");
    require(result.unassignedOrderIds == leftoverOrders, "Incorrect unassigned orders or order");
}

void validateTrace(const std::vector<Rider>& riders, const std::vector<Order>& orders, const Result& result) {
    const std::size_t count = std::min(riders.size(), orders.size());
    require(result.steps.size() == count, "Trace length");
    std::vector<bool> usedRiders(riders.size(), false);
    std::vector<bool> usedOrders(orders.size(), false);
    std::uint64_t evaluations = 0;
    double cumulative = 0.0;
    for (std::size_t k = 0; k < count; ++k) {
        const GreedyStep& step = result.steps[k];
        require(step.iteration == k + 1, "Iteration number");
        require(step.candidates.size() == (riders.size() - k) * (orders.size() - k), "Candidate count");
        std::size_t position = 0;
        std::size_t bestPosition = 0;
        double bestDistance = std::numeric_limits<double>::infinity();
        for (std::size_t r = 0; r < riders.size(); ++r) {
            if (usedRiders[r]) continue;
            for (std::size_t o = 0; o < orders.size(); ++o) {
                if (usedOrders[o]) continue;
                const CandidatePair& candidate = step.candidates.at(position);
                require(candidate.riderIndex == r && candidate.orderIndex == o, "Candidate index/order");
                require(candidate.assignment.riderId == riders[r].id
                    && candidate.assignment.orderId == orders[o].id, "Candidate IDs");
                const double distance = referenceDistance(riders[r], orders[o]);
                require(near(candidate.assignment.distance, distance), "Trace distance");
                // Select using actual unrounded recorded values. Independent
                // reference distances are checked above within numeric tolerance.
                if (candidate.assignment.distance < bestDistance) {
                    bestDistance = candidate.assignment.distance;
                    bestPosition = position;
                }
                ++position;
            }
        }
        const CandidatePair& expected = step.candidates.at(bestPosition);
        require(step.selected.riderIndex == expected.riderIndex
            && step.selected.orderIndex == expected.orderIndex, "Incorrect minimum/tie choice");
        const Assignment& assignment = result.assignments[k];
        require(assignment.riderId == expected.assignment.riderId
            && assignment.orderId == expected.assignment.orderId
            && assignment.distance == expected.assignment.distance, "Trace/result mismatch");
        require(step.selected.assignment.riderId == assignment.riderId
            && step.selected.assignment.orderId == assignment.orderId
            && step.selected.assignment.distance == assignment.distance, "Selected trace pair mismatch");
        usedRiders[step.selected.riderIndex] = true;
        usedOrders[step.selected.orderIndex] = true;
        cumulative += assignment.distance;
        require(step.cumulativeTotal == cumulative, "Trace cumulative total");
        evaluations += step.candidates.size();
    }
    require(result.statistics.distanceEvaluations == evaluations, "Greedy evaluations");
    require(result.statistics.candidateChecks == evaluations, "Greedy candidate checks");
    require(result.statistics.completeAssignments == 0 && result.statistics.recursiveCalls == 0, "Greedy search counters");
}

void validateSearchStatistics(std::size_t riders, std::size_t orders, const Result& result) {
    const std::size_t smaller = std::min(riders, orders);
    const std::size_t larger = std::max(riders, orders);
    std::uint64_t nodes = 0;
    std::uint64_t nonLeaves = 0;
    for (std::size_t depth = 0; depth <= smaller; ++depth) {
        const std::uint64_t atDepth = permutations(larger, depth);
        nodes += atDepth;
        if (depth < smaller) nonLeaves += atDepth;
    }
    const auto& stats = result.statistics;
    require(stats.completeAssignments == permutations(larger, smaller), "Exhaustive leaf count: possible pruning or missed subsets");
    require(stats.recursiveCalls == nodes, "Recursive node count");
    require(stats.candidateChecks == larger * nonLeaves, "Recursive loop checks");
    require(stats.distanceEvaluations == nodes - 1, "Exhaustive distance evaluations");
    require(stats.bestUpdates >= 1 && stats.bestUpdates <= stats.completeAssignments, "Best update count");
    require(stats.bestAssignmentsCopied == smaller * stats.bestUpdates, "Best copy count");
    require(result.steps.empty(), "Optimal result should not contain greedy trace");
}

void verifyCase(const std::vector<Rider>& riders, const std::vector<Order>& orders, bool useOracle = true) {
    const Result greedy = greedyAssignment(riders, orders);
    const Result optimal = optimalAssignment(riders, orders);
    validateResult(riders, orders, greedy);
    validateResult(riders, orders, optimal);
    validateTrace(riders, orders, greedy);
    validateSearchStatistics(riders.size(), orders.size(), optimal);
    require(optimal.totalDistance <= greedy.totalDistance + 1e-10 * std::max(1.0, greedy.totalDistance), "Optimal exceeds greedy");
    if (useOracle) {
        const OracleResult oracle = permutationOracle(riders, orders);
        require(near(optimal.totalDistance, oracle.total), "Permutation oracle disagreement");
        require(optimal.statistics.completeAssignments == oracle.count, "Oracle assignment count disagreement");
    }
    ++checkedCases;
}

void checkExpectedPairs(const Result& result, const nlohmann::json& pairs) {
    require(result.assignments.size() == pairs.size(), "Expected pair count");
    for (std::size_t k = 0; k < pairs.size(); ++k) {
        require(result.assignments[k].riderId == pairs[k][0].get<std::string>()
            && result.assignments[k].orderId == pairs[k][1].get<std::string>()
            && near(result.assignments[k].distance, pairs[k][2].get<double>()), "Expected pair sequence");
    }
}

void testFixtures(const std::filesystem::path& directory) {
    std::vector<std::filesystem::path> paths;
    for (const auto& entry : std::filesystem::directory_iterator(directory)) {
        if (entry.path().extension() == ".json") paths.push_back(entry.path());
    }
    std::sort(paths.begin(), paths.end());
    require(paths.size() == 12, "Missing verified fixtures");
    for (const auto& path : paths) {
        std::ifstream input(path);
        require(input.good(), "Cannot read fixture " + path.string());
        nlohmann::json fixture;
        input >> fixture;
        const Request request = parseRequest(fixture);
        verifyCase(request.riders, request.orders);
        const Result greedy = greedyAssignment(request.riders, request.orders);
        const Result optimal = optimalAssignment(request.riders, request.orders);
        const auto& expected = fixture.at("expected");
        // Supplied approximate expectations are independently checked by the
        // compiled algorithms and permutation oracle, not used to compute them.
        require(std::abs(greedy.totalDistance - expected.at("greedyTotal").get<double>()) < 1e-10, path.string() + " greedy expectation");
        require(std::abs(optimal.totalDistance - expected.at("optimalTotal").get<double>()) < 1e-10, path.string() + " optimal expectation");
        for (const Result* result : {&greedy, &optimal}) {
            require(result->unassignedRiderIds == expected.at("unassignedRiderIds").get<std::vector<std::string>>(), "Fixture unassigned riders");
            require(result->unassignedOrderIds == expected.at("unassignedOrderIds").get<std::vector<std::string>>(), "Fixture unassigned orders");
        }
        if (expected.contains("greedySequence")) checkExpectedPairs(greedy, expected.at("greedySequence"));
        if (expected.contains("optimalAssignments")) checkExpectedPairs(optimal, expected.at("optimalAssignments"));
        if (expected.contains("difference")) {
            require(near(greedy.totalDistance - optimal.totalDistance, expected.at("difference")), "Counterexample difference");
            require(near((greedy.totalDistance - optimal.totalDistance) / optimal.totalDistance * 100.0,
                         expected.at("greedyOverheadPercent")), "Counterexample overhead");
        }
        std::cout << "[PASS] " << path.stem().string() << " greedy=" << greedy.totalDistance
                  << " optimal=" << optimal.totalDistance << " evaluations=" << greedy.statistics.distanceEvaluations
                  << " complete=" << optimal.statistics.completeAssignments << '\n';
    }
}

void testGeneratedTinyCases() {
    std::mt19937 random(20261007);
    for (std::size_t r = 0; r <= 4; ++r) {
        for (std::size_t o = 0; o <= 4; ++o) {
            for (int trial = 0; trial < 8; ++trial) {
                std::vector<Rider> riders;
                std::vector<Order> orders;
                for (std::size_t k = 0; k < r; ++k) {
                    riders.push_back({"R" + std::to_string(k + 1),
                        static_cast<double>(static_cast<int>(random() % 11) - 5),
                        static_cast<double>(static_cast<int>(random() % 11) - 5)});
                }
                for (std::size_t k = 0; k < o; ++k) {
                    orders.push_back({"O" + std::to_string(k + 1),
                        static_cast<double>(static_cast<int>(random() % 11) - 5),
                        static_cast<double>(static_cast<int>(random() % 11) - 5)});
                }
                verifyCase(riders, orders);
            }
        }
    }
    std::cout << "[PASS] 200 seeded tiny cases against permutation oracle\n";
}

void testTiesSubsetsAndPrecision() {
    const std::vector<Rider> riders{{"Z", 0, 0}, {"A", 0, 0}};
    const std::vector<Order> orders{{"Y", 1, 0}, {"B", -1, 0}};
    verifyCase(riders, orders);
    for (int repeat = 0; repeat < 3; ++repeat) {
        const Result greedy = greedyAssignment(riders, orders);
        const Result optimal = optimalAssignment(riders, orders);
        require(greedy.assignments[0].riderId == "Z" && greedy.assignments[0].orderId == "Y", "Tie must use indices, not IDs");
        require(optimal.assignments[0].riderId == "Z" && optimal.assignments[0].orderId == "Y", "Optimal equal-total reproducibility");
    }
    const std::vector<Rider> subsetRiders{{"R1", 1000, 1000}, {"R2", 0, 0}, {"R3", 10, 0}};
    const std::vector<Order> subsetOrders{{"O1", 1, 0}, {"O2", 11, 0}};
    verifyCase(subsetRiders, subsetOrders);
    const Result subset = optimalAssignment(subsetRiders, subsetOrders);
    require(subset.unassignedRiderIds == std::vector<std::string>{"R1"}, "Must explore later rider subsets");

    const std::vector<Rider> preciseRiders{{"R1", 0, 0}, {"R2", 10, 0}};
    const std::vector<Order> preciseOrders{{"O1", 1, 1}, {"O2", 12, 1}};
    verifyCase(preciseRiders, preciseOrders);
    const double expected = std::sqrt(2.0) + std::sqrt(5.0);
    require(near(greedyAssignment(preciseRiders, preciseOrders).totalDistance, expected, 1e-14), "Unrounded sum");
    // hypot should stay finite where directly squaring would overflow.
    const double large = euclideanDistance({"R", 0, 0}, {"O", 1e200, 1e200});
    require(near(large / 1e200, std::sqrt(2.0), 1e-14), "Stable Euclidean distance");
    verifyCase({{"same", 0, 0}}, {{"same", 1, 0}});
    std::cout << "[PASS] input-index ties, larger-group subsets, and full precision\n";
}

template <typename Function>
void expectException(Function function, const std::string& message) {
    bool thrown = false;
    try { function(); } catch (const std::exception&) { thrown = true; }
    require(thrown, message);
}

void testInvalidInputs() {
    const std::vector<Order> orders{{"O1", 0, 0}};
    for (const std::vector<Rider>& riders : std::vector<std::vector<Rider>>{
            {{"", 0, 0}}, {{"R1", 0, 0}, {"R1", 1, 1}},
            {{"R1", std::numeric_limits<double>::infinity(), 0}},
            {{"R1", 0, std::numeric_limits<double>::quiet_NaN()}}}) {
        expectException([&] { greedyAssignment(riders, orders); }, "Greedy accepted invalid rider");
        expectException([&] { optimalAssignment(riders, orders); }, "Optimal accepted invalid rider");
    }
    const std::vector<Rider> riders{{"R1", 0, 0}};
    for (const std::vector<Order>& invalidOrders : std::vector<std::vector<Order>>{
            {{"", 0, 0}}, {{"O1", 0, 0}, {"O1", 1, 1}},
            {{"O1", 0, std::numeric_limits<double>::infinity()}}}) {
        expectException([&] { greedyAssignment(riders, invalidOrders); }, "Greedy accepted invalid order");
        expectException([&] { optimalAssignment(riders, invalidOrders); }, "Optimal accepted invalid order");
    }
    const double maximum = std::numeric_limits<double>::max();
    expectException([&] { euclideanDistance({"R", maximum, 0}, {"O", -maximum, 0}); }, "Overflow distance accepted");
    expectException([&] { addDistance(maximum, maximum); }, "Overflow total accepted");
    std::cout << "[PASS] invalid IDs, nonfinite coordinates, and numeric overflow\n";
}
} // namespace

int main(int argc, char* argv[]) {
    try {
        require(argc == 2, "Usage: algorithm_tests DATASET_DIRECTORY");
        std::cout << std::setprecision(17);
        testFixtures(argv[1]);
        testGeneratedTinyCases();
        testTiesSubsetsAndPrecision();
        testInvalidInputs();
        std::cout << "All C++ checks passed: " << checkedCases << " valid cases plus invalid-input checks.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "[FAIL] " << error.what() << '\n';
        return 1;
    }
}
