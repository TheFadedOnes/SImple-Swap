#!/usr/bin/env bash

ADDRESS="45yDzEnyytu9FgqbQLFywzWeGo8f6GmamUwdm6GsHcHE"
AMOUNT=2
URL="https://rpc.ankr.com/solana_devnet/03fa5464752dc32bca66d8be11db8d4650ad1f18e1f7d3859eda8ac9139747eb"

MAX_RETRIES=5
RETRY_DELAY=10  # seconds

for ((i=1; i<=MAX_RETRIES; i++)); do
  echo "Attempt $i of $MAX_RETRIES: Requesting airdrop..."
  solana airdrop $AMOUNT $ADDRESS --url $URL && break
  echo "Airdrop failed. Waiting $RETRY_DELAY seconds before retry..."
  sleep $RETRY_DELAY
done
