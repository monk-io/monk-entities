#!/bin/bash

# Build script for MonkEC modules
# Usage: ./build.sh [module1] [module2] ...

# Default modules if none specified
modules=("${@:-monkec mongodb-atlas}")

for module in "${modules[@]}"; do
    echo "Building $module..."
    INPUT_DIR="./src/$module/" OUTPUT_DIR="./dist/$module/" ./monkec.sh compile
done
