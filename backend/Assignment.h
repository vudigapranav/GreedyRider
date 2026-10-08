#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

struct Assignment {
    std::string riderId;
    std::string orderId;
    double distance = 0.0;
};

struct AlgorithmStatistics {
    std::uint64_t distanceEvaluations = 0;
    std::uint64_t completeAssignments = 0;
    std::uint64_t recursiveCalls = 0;
    std::uint64_t candidateChecks = 0;
    std::uint64_t bestUpdates = 0;
    std::uint64_t bestAssignmentsCopied = 0;
};

struct CandidatePair {
    // Zero-based positions in the original input; IDs are never sorted.
    std::size_t riderIndex = 0;
    std::size_t orderIndex = 0;
    Assignment assignment;
};

struct GreedyStep {
    std::size_t iteration = 0; // One-based for presentation.
    std::vector<CandidatePair> candidates;
    CandidatePair selected;
    double cumulativeTotal = 0.0;
};

struct Result {
    std::vector<Assignment> assignments;
    double totalDistance = 0.0;
    std::vector<std::string> unassignedRiderIds;
    std::vector<std::string> unassignedOrderIds;
    AlgorithmStatistics statistics;
    std::vector<GreedyStep> steps; // Empty for exhaustive search.
};
