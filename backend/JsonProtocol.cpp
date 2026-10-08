#include "JsonProtocol.h"

#include "GreedyAssignment.h"
#include "InputValidation.h"
#include "OptimalAssignment.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <stdexcept>

namespace {
using nlohmann::json;
constexpr std::size_t maxGroupSize = 8;
constexpr std::uint64_t maxCompleteAssignments = 40320;

template <typename Item>
std::vector<Item> parseGroup(const json& input, const std::string& key) {
    if (!input.contains(key) || !input.at(key).is_array()) {
        throw std::invalid_argument(key + " must be an array");
    }
    if (input.at(key).size() > maxGroupSize) {
        throw std::invalid_argument(key + " permits at most 8 members");
    }
    std::vector<Item> items;
    for (const json& item : input.at(key)) {
        if (!item.is_object() || !item.contains("id") || !item.at("id").is_string()
            || !item.contains("x") || !item.at("x").is_number()
            || !item.contains("y") || !item.at("y").is_number()) {
            throw std::invalid_argument(key + " members require string id and numeric x, y");
        }
        const std::string id = item.at("id").get<std::string>();
        const double x = item.at("x").get<double>();
        const double y = item.at("y").get<double>();
        if (id.find_first_not_of(" \t\r\n") == std::string::npos || id.size() > 32) {
            throw std::invalid_argument(key + " IDs must contain text and be at most 32 UTF-8 bytes");
        }
        if (!std::isfinite(x) || !std::isfinite(y) || x < -1000 || x > 1000 || y < -1000 || y > 1000) {
            throw std::invalid_argument(key + " coordinates must be finite numbers between -1000 and 1000");
        }
        items.push_back({id, x, y});
    }
    return items;
}

json assignmentToJson(const Assignment& assignment) {
    return {{"riderId", assignment.riderId}, {"orderId", assignment.orderId},
            {"distance", assignment.distance}};
}

json candidateToJson(const CandidatePair& candidate) {
    json output = assignmentToJson(candidate.assignment);
    output["riderIndex"] = candidate.riderIndex;
    output["orderIndex"] = candidate.orderIndex;
    return output;
}

void checkExhaustiveSize(std::size_t riders, std::size_t orders) {
    const std::size_t smaller = std::min(riders, orders);
    const std::size_t larger = std::max(riders, orders);
    std::uint64_t count = 1;
    for (std::size_t k = 0; k < smaller; ++k) {
        const std::uint64_t factor = larger - k;
        // Check before multiplying so the guard itself cannot overflow.
        if (count > maxCompleteAssignments / factor) {
            throw std::invalid_argument("Exhaustive request exceeds 40320 complete assignments");
        }
        count *= factor;
    }
}
template <typename Algorithm>
json timedResult(Algorithm algorithm, const Request& request) {
    const auto start = std::chrono::steady_clock::now();
    const Result result = algorithm(request.riders, request.orders);
    const auto finish = std::chrono::steady_clock::now();
    json output = resultToJson(result);
    output["executionTimeMs"] = std::chrono::duration<double, std::milli>(finish - start).count();
    output["timingScope"] = "C++ algorithm including validation; excludes JSON, process startup, and HTTP";
    output["explanation"] = request.riders.empty() || request.orders.empty()
        ? "No assignment can be made because at least one group is empty. Total distance is zero."
        : "Assigns min(riders, orders) pairs, using each rider and order at most once.";
    return output;
}
} // namespace

Request parseRequest(const nlohmann::json& input) {
    if (!input.is_object()) {
        throw std::invalid_argument("Request must be a JSON object");
    }
    Request request;
    if (input.contains("algorithm")) {
        if (!input.at("algorithm").is_string()) {
            throw std::invalid_argument("algorithm must be greedy, optimal, or both");
        }
        request.algorithm = input.at("algorithm").get<std::string>();
    }
    if (request.algorithm != "greedy" && request.algorithm != "optimal" && request.algorithm != "both") {
        throw std::invalid_argument("algorithm must be greedy, optimal, or both");
    }
    request.riders = parseGroup<Rider>(input, "riders");
    request.orders = parseGroup<Order>(input, "orders");
    validateInputs(request.riders, request.orders);
    if (request.algorithm != "greedy") {
        checkExhaustiveSize(request.riders.size(), request.orders.size());
    }
    return request;
}

nlohmann::json resultToJson(const Result& result) {
    nlohmann::json assignments = nlohmann::json::array();
    for (const Assignment& assignment : result.assignments) {
        assignments.push_back(assignmentToJson(assignment));
    }
    nlohmann::json steps = nlohmann::json::array();
    for (const GreedyStep& step : result.steps) {
        nlohmann::json candidates = nlohmann::json::array();
        for (const CandidatePair& candidate : step.candidates) {
            candidates.push_back(candidateToJson(candidate));
        }
        steps.push_back({{"iteration", step.iteration}, {"candidates", candidates},
                         {"selected", candidateToJson(step.selected)},
                         {"cumulativeTotal", step.cumulativeTotal}});
    }
    const AlgorithmStatistics& stats = result.statistics;
    return {{"assignments", assignments}, {"totalDistance", result.totalDistance},
            {"unassignedRiderIds", result.unassignedRiderIds},
            {"unassignedOrderIds", result.unassignedOrderIds}, {"steps", steps},
            {"statistics", {{"distanceEvaluations", stats.distanceEvaluations},
                            {"completeAssignments", stats.completeAssignments},
                            {"recursiveCalls", stats.recursiveCalls},
                            {"candidateChecks", stats.candidateChecks},
                            {"bestUpdates", stats.bestUpdates},
                            {"bestAssignmentsCopied", stats.bestAssignmentsCopied}}}};
}

nlohmann::json executeRequest(const Request& request) {
    nlohmann::json response = nlohmann::json::object();
    if (request.algorithm != "optimal") {
        response["greedy"] = timedResult(greedyAssignment, request);
    }
    if (request.algorithm != "greedy") {
        response["optimal"] = timedResult(optimalAssignment, request);
    }
    if (request.algorithm == "both") {
        const double greedyTotal = response["greedy"]["totalDistance"];
        const double optimalTotal = response["optimal"]["totalDistance"];
        const double difference = greedyTotal - optimalTotal;
        nlohmann::json overhead = nullptr;
        std::string explanation;
        if (optimalTotal == 0.0 && greedyTotal == 0.0) {
            overhead = 0.0;
            explanation = "Both totals are zero; greedy overhead is defined as zero.";
        } else if (optimalTotal == 0.0) {
            explanation = "Percentage is undefined because the optimal total is zero and the greedy total is nonzero.";
        } else {
            const double percent = (difference / optimalTotal) * 100.0;
            if (std::isfinite(percent)) {
                overhead = percent;
            } else {
                explanation = "Percentage is outside the finite double range.";
            }
        }
        response["comparison"] = {{"difference", difference}, {"absoluteDifference", std::abs(difference)},
                                  {"greedyOverheadPercent", overhead}, {"explanation", explanation}};
    }
    return response;
}
