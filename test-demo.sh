#!/bin/bash
# DeskBuddy 动画全播放测试脚本
# 用法: bash test-demo.sh [每个动画秒数，默认8]

DELAY=${1:-8}

SVGS=(
  "deskbuddy-idle-living.svg"
  "deskbuddy-sleeping.svg"
  "deskbuddy-working-thinking.svg"
  "deskbuddy-working-typing.svg"
  "deskbuddy-working-juggling.svg"
  "deskbuddy-working-sweeping.svg"
  "deskbuddy-working-building.svg"
  "deskbuddy-working-debugger.svg"
  "deskbuddy-working-wizard.svg"
  "deskbuddy-working-carrying.svg"
  "deskbuddy-working-conducting.svg"
  "deskbuddy-working-confused.svg"
  "deskbuddy-working-overheated.svg"
  "deskbuddy-error.svg"
  "deskbuddy-working-ultrathink.svg"
  "deskbuddy-happy.svg"
  "deskbuddy-notification.svg"
  "deskbuddy-disconnected.svg"
)

echo "=== DeskBuddy Demo: ${#SVGS[@]} animations, ${DELAY}s each ==="
for i in "${!SVGS[@]}"; do
  svg="${SVGS[$i]}"
  echo "[$((i+1))/${#SVGS[@]}] $svg"
  curl -s -X POST http://127.0.0.1:23333/state \
    -H "Content-Type: application/json" \
    -d "{\"state\":\"working\",\"svg\":\"$svg\"}"
  sleep "$DELAY"
done
echo "=== DONE ==="
