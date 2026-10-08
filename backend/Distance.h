#pragma once

#include "Order.h"
#include "Rider.h"

double euclideanDistance(const Rider& rider, const Order& order);
double addDistance(double total, double distance);
