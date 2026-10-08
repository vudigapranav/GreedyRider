#include "JsonProtocol.h"

#include <iostream>
#include <stdexcept>
#include <string>

int main() {
    try {
        // One JSON request per process, terminated by EOF. stdout is JSON only.
        constexpr std::size_t maxInputBytes = 64 * 1024;
        std::string input;
        char buffer[4096];
        while (std::cin.read(buffer, sizeof(buffer)) || std::cin.gcount() > 0) {
            input.append(buffer, static_cast<std::size_t>(std::cin.gcount()));
            if (input.size() > maxInputBytes) {
                throw std::length_error("Request exceeds 64 KiB");
            }
        }
        if (std::cin.bad()) {
            throw std::runtime_error("Could not read standard input");
        }
        const Request request = parseRequest(nlohmann::json::parse(input));
        std::cout << executeRequest(request).dump() << '\n';
        return 0;
    } catch (const std::exception& error) {
        std::string code = "INVALID_INPUT";
        if (dynamic_cast<const nlohmann::json::parse_error*>(&error)) code = "INVALID_JSON";
        if (dynamic_cast<const std::length_error*>(&error)) code = "REQUEST_TOO_LARGE";
        std::cerr << "rider_assignment: " << error.what() << '\n';
        std::cout << nlohmann::json({{"error", {{"code", code}, {"message", error.what()}}}}).dump() << '\n';
        return 1;
    }
}
