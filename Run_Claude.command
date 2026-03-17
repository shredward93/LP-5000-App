#!/bin/bash
echo "----------------------------------------"
echo "Booting the LP 5000 Smart Engine..."
echo "----------------------------------------"
cd "$(dirname "$0")"
source .venv/bin/activate
python3 main.py
