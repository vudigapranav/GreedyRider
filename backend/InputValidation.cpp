#include "InputValidation.h"

#include <cmath>
#include <set>
#include <stdexcept>
#include <string>

namespace {
template <typename Item>
void validateGroup(const std::vector<Item>& items, const std::string& group) {
    std::set<std::string> ids;
    for (const Item& item : items) {
        if (item.id.empty() || !ids.insert(item.id).second) {
            throw std::invalid_argument(group + " IDs must be nonempty and unique within the group");
        }
        if (!std::isfinite(item.x) || !std::isfinite(item.y)) {
            throw std::invalid_argument(group + " coordinates must be finite");
        }
    }
}
} // namespace

void validateInputs(const std::vector<Rider>& riders, const std::vector<Order>& orders) {
    validateGroup(riders, "Rider");
    validateGroup(orders, "Order");
}
