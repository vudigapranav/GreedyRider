#pragma once

#include "Assignment.h"
#include "Order.h"
#include "Rider.h"

#include <nlohmann/json.hpp>
#include <string>

struct Request {
    std::string algorithm = "both";
    std::vector<Rider> riders;
    std::vector<Order> orders;
};

Request parseRequest(const nlohmann::json& input);
nlohmann::json resultToJson(const Result& result);
nlohmann::json executeRequest(const Request& request);
