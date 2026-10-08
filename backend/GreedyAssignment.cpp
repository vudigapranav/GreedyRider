#include "GreedyAssignment.h"

#include "Distance.h"
#include "InputValidation.h"

#include <algorithm>
#include <limits>
#include <utility>

Result greedyAssignment(const std::vector<Rider>& riders, const std::vector<Order>& orders) {
    validateInputs(riders, orders);
    Result result;
    std::vector<bool> usedRiders(riders.size(), false);
    std::vector<bool> usedOrders(orders.size(), false);
    const std::size_t count = std::min(riders.size(), orders.size());

    for (std::size_t iteration = 0; iteration < count; ++iteration) {
        GreedyStep step;
        step.iteration = iteration + 1;
        double smallest = std::numeric_limits<double>::infinity();

        for (std::size_t r = 0; r < riders.size(); ++r) {
            if (usedRiders[r]) {
                continue;
            }
            for (std::size_t o = 0; o < orders.size(); ++o) {
                if (usedOrders[o]) {
                    continue;
                }
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
            }
        }

        usedRiders[step.selected.riderIndex] = true;
        usedOrders[step.selected.orderIndex] = true;
        result.assignments.push_back(step.selected.assignment);
        result.totalDistance = addDistance(result.totalDistance, smallest);
        step.cumulativeTotal = result.totalDistance;
        result.steps.push_back(std::move(step));
    }

    for (std::size_t r = 0; r < riders.size(); ++r) {
        if (!usedRiders[r]) {
            result.unassignedRiderIds.push_back(riders[r].id);
        }
    }
    for (std::size_t o = 0; o < orders.size(); ++o) {
        if (!usedOrders[o]) {
            result.unassignedOrderIds.push_back(orders[o].id);
        }
    }
    return result;
}
