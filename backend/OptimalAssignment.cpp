#include "OptimalAssignment.h"

#include "Distance.h"
#include "InputValidation.h"

#include <algorithm>
#include <limits>

namespace {
struct Search {
    const std::vector<Rider>& riders;
    const std::vector<Order>& orders;
    bool ridersAreSmaller;
    std::size_t smallerCount;
    std::size_t largerCount;
    std::vector<bool> usedLarger;
    std::vector<Assignment> current;
    std::vector<std::size_t> currentLargerIndices;
    std::vector<std::size_t> bestLargerIndices;
    Result best;

    Search(const std::vector<Rider>& riderInput, const std::vector<Order>& orderInput)
        : riders(riderInput), orders(orderInput),
          ridersAreSmaller(riders.size() <= orders.size()),
          smallerCount(std::min(riders.size(), orders.size())),
          largerCount(std::max(riders.size(), orders.size())),
          usedLarger(largerCount, false) {
        best.totalDistance = std::numeric_limits<double>::infinity();
    }

    void visit(std::size_t depth, double total) {
        ++best.statistics.recursiveCalls;
        if (depth == smallerCount) {
            ++best.statistics.completeAssignments;
            // Equal totals retain the first complete assignment in input order.
            if (total < best.totalDistance) {
                best.totalDistance = total;
                best.assignments = current;
                bestLargerIndices = currentLargerIndices;
                ++best.statistics.bestUpdates;
                best.statistics.bestAssignmentsCopied += current.size();
            }
            return;
        }

        // Scan all M larger-group members at each non-leaf node.
        // Even expensive partial assignments are explored; there is no pruning.
        for (std::size_t largerIndex = 0; largerIndex < largerCount; ++largerIndex) {
            ++best.statistics.candidateChecks;
            if (usedLarger[largerIndex]) {
                continue;
            }
            const std::size_t r = ridersAreSmaller ? depth : largerIndex;
            const std::size_t o = ridersAreSmaller ? largerIndex : depth;
            const double distance = euclideanDistance(riders[r], orders[o]);
            ++best.statistics.distanceEvaluations;
            usedLarger[largerIndex] = true;
            current.push_back({riders[r].id, orders[o].id, distance});
            currentLargerIndices.push_back(largerIndex);

            visit(depth + 1, addDistance(total, distance));

            currentLargerIndices.pop_back();
            current.pop_back();
            usedLarger[largerIndex] = false;
        }
    }
};
} // namespace

Result optimalAssignment(const std::vector<Rider>& riders, const std::vector<Order>& orders) {
    validateInputs(riders, orders);
    Search search(riders, orders);
    search.visit(0, 0.0);

    // The smaller group is fully assigned. Reconstruct larger-group leftovers
    // using indices, so output remains in original input order.
    std::vector<bool> assignedLarger(search.largerCount, false);
    for (std::size_t index : search.bestLargerIndices) {
        assignedLarger[index] = true;
    }
    for (std::size_t index = 0; index < search.largerCount; ++index) {
        if (!assignedLarger[index]) {
            if (search.ridersAreSmaller) {
                search.best.unassignedOrderIds.push_back(orders[index].id);
            } else {
                search.best.unassignedRiderIds.push_back(riders[index].id);
            }
        }
    }
    return search.best;
}
