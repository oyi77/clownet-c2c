#!/bin/bash
PORT=$1
MAX_TRIES=20
COUNTER=0

while [ $COUNTER -lt $MAX_TRIES ]; do
  if nc -z localhost $PORT 2>/dev/null; then
    exit 0
  fi
  sleep 0.2
  let COUNTER+=1
done

exit 1
