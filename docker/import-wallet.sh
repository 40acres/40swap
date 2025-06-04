#!/bin/bash

# This script automates wallet setup for 40Swap
# It requires four parameters:
# 1. Account Key Path (e.g., 7678fa3a/84'/1'/0')
# 2. Master HD Key
# 3. SLIP77 Master Blinding Key
# 4. Wallet Name

# Check if all four parameters are provided
if [ $# -ne 4 ]; then
    echo "Usage: $0 <account_key_path> <master_hd_key> <slip77_master_blinding_key> <wallet_name>"
    echo "Example: $0 \"7678fa3a/84'/1'/0'\" \"tprv8ZgxMBicQKsPeQJJW6cSSz4afQ9ZMe4j7nUGUVSGG3DsvXZZi1yS925SfGHZwLRMDd6FdcZ97tgq3zucMFZquBi4TYmi817YrKEmXrxGhkA\" \"a1d24c4cacaec89d404c54c03901c5dbbb0703a90858bec6ed86dc89e4804098\" \"my-wallet\""
    exit 1
fi

ACCOUNT_KEY_PATH=$1
MASTER_HD_KEY=$2
MASTER_BLINDING_KEY=$3
WALLET_NAME=$4

# Construct the full private key descriptor
PRIVATE_KEY="[$ACCOUNT_KEY_PATH]$MASTER_HD_KEY"

echo "Creating wallet: $WALLET_NAME..."
docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main -named createwallet \
    wallet_name=$WALLET_NAME \
    disable_private_keys=false \
    blank=false \
    passphrase= \
    avoid_reuse=false \
    descriptors=true \
    load_on_startup=true

echo "Getting descriptor info for receive addresses..."
RECEIVE_DESCRIPTOR_INFO=$(docker exec -it 40swap_elements \
    elements-cli -chain=liquidregtest getdescriptorinfo \
    "wpkh($PRIVATE_KEY/0/*)")

# Extract the descriptor and checksum
RECEIVE_DESCRIPTOR=$(echo $RECEIVE_DESCRIPTOR_INFO | grep -o '"descriptor": "[^"]*"' | cut -d'"' -f4)
RECEIVE_CHECKSUM=$(echo $RECEIVE_DESCRIPTOR_INFO | grep -o '"checksum": "[^"]*"' | cut -d'"' -f4)

echo "Getting descriptor info for change addresses..."
CHANGE_DESCRIPTOR_INFO=$(docker exec -it 40swap_elements \
    elements-cli -chain=liquidregtest getdescriptorinfo \
    "wpkh($PRIVATE_KEY/1/*)")

# Extract the descriptor and checksum
CHANGE_DESCRIPTOR=$(echo $CHANGE_DESCRIPTOR_INFO | grep -o '"descriptor": "[^"]*"' | cut -d'"' -f4)
CHANGE_CHECKSUM=$(echo $CHANGE_DESCRIPTOR_INFO | grep -o '"checksum": "[^"]*"' | cut -d'"' -f4)

echo "Importing descriptors to wallet..."
docker exec -it 40swap_elements \
    elements-cli -chain=liquidregtest -rpcwallet=$WALLET_NAME importdescriptors \
    "[
        {
            \"desc\": \"wpkh($PRIVATE_KEY/0/*)#$RECEIVE_CHECKSUM\",
            \"timestamp\": \"now\",
            \"active\": true,
            \"range\": [0, 1000]
        },
        {
            \"desc\": \"wpkh($PRIVATE_KEY/1/*)#$CHANGE_CHECKSUM\",
            \"timestamp\": \"now\",
            \"active\": false,
            \"range\": [0, 1000]
        }
    ]"

echo "Importing master blinding key..."
docker exec -it 40swap_elements \
    elements-cli -chain=liquidregtest -rpcwallet=$WALLET_NAME \
    importmasterblindingkey $MASTER_BLINDING_KEY

echo "Wallet setup complete!"
