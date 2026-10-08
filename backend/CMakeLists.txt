cmake_minimum_required(VERSION 3.16)
project(GreedyRiderAlgorithms LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(ENABLE_SANITIZERS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    add_compile_options(-Wall -Wextra -Wpedantic)
    if(ENABLE_SANITIZERS)
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
endif()

add_library(assignment_algorithms
    Distance.cpp InputValidation.cpp GreedyAssignment.cpp OptimalAssignment.cpp)
target_include_directories(assignment_algorithms PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")

add_library(json_protocol JsonProtocol.cpp)
target_link_libraries(json_protocol PUBLIC assignment_algorithms)
target_include_directories(json_protocol SYSTEM PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/third_party")

add_executable(rider_assignment main.cpp)
target_link_libraries(rider_assignment PRIVATE json_protocol)

enable_testing()
add_executable(algorithm_tests tests/AlgorithmTests.cpp)
target_link_libraries(algorithm_tests PRIVATE json_protocol)
add_test(NAME algorithm_tests COMMAND algorithm_tests "${CMAKE_CURRENT_SOURCE_DIR}/../datasets")

find_program(NODE_EXECUTABLE node)
if(NODE_EXECUTABLE)
    add_test(NAME json_and_bridge_tests
        COMMAND "${NODE_EXECUTABLE}" --test "${CMAKE_CURRENT_SOURCE_DIR}/tests/IntegrationTests.mjs")
    set_tests_properties(json_and_bridge_tests PROPERTIES
        ENVIRONMENT "RIDER_EXECUTABLE=$<TARGET_FILE:rider_assignment>" TIMEOUT 60)
else()
    message(STATUS "Node not found: only C++ algorithm tests are registered")
endif()
