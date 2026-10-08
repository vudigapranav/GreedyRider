#pragma once

#include "Assignment.h"
#include "Order.h"
#include "Rider.h"

// Exhaustive backtracking, deliberately without branch-and-bound pruning.
Result optimalAssignment(const std::vector<Rider>& riders, const std::vector<Order>& orders);
