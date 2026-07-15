#!/bin/bash
cd "$(dirname "$0")"
echo "----------------------------------------"
echo " Starting LP 5000 Smart Engine..."
echo "----------------------------------------"
if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (this only happens once)..."
  npm install
fi
npm start
