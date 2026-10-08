#include "Distance.h"

#include <cmath>
#include <stdexcept>

double euclideanDistance(const Rider& rider, const Order& order) {
    // hypot avoids unnecessary overflow from squaring large differences.
    // All calculations remain double precision, without decimal rounding.
    const double distance = std::hypot(rider.x - order.x, rider.y - order.y);
    if (!std::isfinite(distance)) {
        throw std::overflow_error("Distance is not representable as a finite double");
    }
    return distance;
}

double addDistance(double total, double distance) {
    const double next = total + distance;
    if (!std::isfinite(next)) {
        throw std::overflow_error("Total distance is not representable as a finite double");
    }
    return next;
}
