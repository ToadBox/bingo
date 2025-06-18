#!/bin/bash

# Set environment to test
export NODE_ENV=test

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Check if axios is installed (needed for tests)
if ! npm list axios > /dev/null 2>&1; then
  echo "Installing test dependencies..."
  npm install axios --save-dev
fi

# Run the API tests
echo "Running API tests..."
node api-test.js

# Store the exit code
TEST_EXIT_CODE=$?

echo "Tests completed with exit code: $TEST_EXIT_CODE"
exit $TEST_EXIT_CODE 