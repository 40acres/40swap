#!/bin/bash

shopt -s expand_aliases
source ./dev-aliases.sh

wait_for_chain_sync() {
  while [ $(40swap-lsp-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-user-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-alice-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-bob-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-charlie-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-david-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-eve-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-frank-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-grace-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-henry-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-iris-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
  while [ $(40swap-jack-lncli getinfo | jq '.synced_to_chain') != "true" ]
  do
    sleep 0.3
  done
}

echo "=== Getting node information for big network setup ==="

# Get node information
lsp_pubkey=$(40swap-lsp-lncli getinfo |jq -r '.identity_pubkey')
lsp_uri=$(40swap-lsp-lncli getinfo |jq -r '.uris[0]')
user_pubkey=$(40swap-user-lncli getinfo |jq -r '.identity_pubkey')
user_uri=$(40swap-user-lncli getinfo |jq -r '.uris[0]')
alice_pubkey=$(40swap-alice-lncli getinfo |jq -r '.identity_pubkey')
alice_uri=$(40swap-alice-lncli getinfo |jq -r '.uris[0]')
bob_pubkey=$(40swap-bob-lncli getinfo |jq -r '.identity_pubkey')
bob_uri=$(40swap-bob-lncli getinfo |jq -r '.uris[0]')
charlie_pubkey=$(40swap-charlie-lncli getinfo |jq -r '.identity_pubkey')
charlie_uri=$(40swap-charlie-lncli getinfo |jq -r '.uris[0]')
david_pubkey=$(40swap-david-lncli getinfo |jq -r '.identity_pubkey')
david_uri=$(40swap-david-lncli getinfo |jq -r '.uris[0]')
eve_pubkey=$(40swap-eve-lncli getinfo |jq -r '.identity_pubkey')
eve_uri=$(40swap-eve-lncli getinfo |jq -r '.uris[0]')
frank_pubkey=$(40swap-frank-lncli getinfo |jq -r '.identity_pubkey')
frank_uri=$(40swap-frank-lncli getinfo |jq -r '.uris[0]')
grace_pubkey=$(40swap-grace-lncli getinfo |jq -r '.identity_pubkey')
grace_uri=$(40swap-grace-lncli getinfo |jq -r '.uris[0]')
henry_pubkey=$(40swap-henry-lncli getinfo |jq -r '.identity_pubkey')
henry_uri=$(40swap-henry-lncli getinfo |jq -r '.uris[0]')
iris_pubkey=$(40swap-iris-lncli getinfo |jq -r '.identity_pubkey')
iris_uri=$(40swap-iris-lncli getinfo |jq -r '.uris[0]')
jack_pubkey=$(40swap-jack-lncli getinfo |jq -r '.identity_pubkey')
jack_uri=$(40swap-jack-lncli getinfo |jq -r '.uris[0]')

echo "=== Creating Bitcoin addresses for funding ==="

# Get new addresses for funding
lsp_addr=$(40swap-lsp-lncli newaddress p2wkh | jq -r .address)
user_addr=$(40swap-user-lncli newaddress p2wkh | jq -r .address)
alice_addr=$(40swap-alice-lncli newaddress p2wkh | jq -r .address)
bob_addr=$(40swap-bob-lncli newaddress p2wkh | jq -r .address)
charlie_addr=$(40swap-charlie-lncli newaddress p2wkh | jq -r .address)
david_addr=$(40swap-david-lncli newaddress p2wkh | jq -r .address)
eve_addr=$(40swap-eve-lncli newaddress p2wkh | jq -r .address)
frank_addr=$(40swap-frank-lncli newaddress p2wkh | jq -r .address)
grace_addr=$(40swap-grace-lncli newaddress p2wkh | jq -r .address)
henry_addr=$(40swap-henry-lncli newaddress p2wkh | jq -r .address)
iris_addr=$(40swap-iris-lncli newaddress p2wkh | jq -r .address)
jack_addr=$(40swap-jack-lncli newaddress p2wkh | jq -r .address)
mining_addr=$(40swap-bitcoin-cli getnewaddress)

echo "=== Funding all Lightning nodes ==="

40swap-bitcoin-cli generatetoaddress 6 $mining_addr

# Fund all nodes with significant amounts for channel opening
40swap-bitcoin-cli -named sendtoaddress address=$lsp_addr amount=50 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$user_addr amount=30 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$alice_addr amount=15 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$bob_addr amount=15 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$charlie_addr amount=12 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$david_addr amount=12 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$eve_addr amount=10 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$frank_addr amount=10 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$grace_addr amount=8 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$henry_addr amount=8 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$iris_addr amount=8 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$jack_addr amount=8 fee_rate=25

40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync

echo "=== Establishing basic connections ==="

# Connect nodes to LSP (main hub)
40swap-lsp-lncli connect "$user_uri"
40swap-lsp-lncli connect "$alice_uri"
40swap-lsp-lncli connect "$bob_uri"
40swap-lsp-lncli connect "$charlie_uri"
40swap-lsp-lncli connect "$david_uri"
40swap-lsp-lncli connect "$eve_uri"
40swap-lsp-lncli connect "$frank_uri"
40swap-lsp-lncli connect "$grace_uri"
40swap-lsp-lncli connect "$henry_uri"
40swap-lsp-lncli connect "$iris_uri"
40swap-lsp-lncli connect "$jack_uri"

echo "=== Opening channels from LSP to all nodes ==="

# Open channels from LSP to create a hub-and-spoke topology
40swap-lsp-lncli openchannel --local_amt 5000000 $user_pubkey
40swap-lsp-lncli openchannel --local_amt 3000000 $alice_pubkey
40swap-lsp-lncli openchannel --local_amt 2000000 $bob_pubkey
40swap-lsp-lncli openchannel --local_amt 2000000 $charlie_pubkey
40swap-lsp-lncli openchannel --local_amt 1500000 $david_pubkey
40swap-lsp-lncli openchannel --local_amt 1500000 $eve_pubkey
40swap-lsp-lncli openchannel --local_amt 1000000 $frank_pubkey
40swap-lsp-lncli openchannel --local_amt 1000000 $grace_pubkey
40swap-lsp-lncli openchannel --local_amt 1000000 $henry_pubkey
40swap-lsp-lncli openchannel --local_amt 1000000 $iris_pubkey
40swap-lsp-lncli openchannel --local_amt 1000000 $jack_pubkey

40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync

echo "=== Creating inter-node channels for network density ==="

# Create channels between other nodes to form a more connected network
# Alice connections
40swap-alice-lncli connect "$bob_uri"
40swap-alice-lncli openchannel --local_amt 1000000 $bob_pubkey
sleep 2

40swap-alice-lncli connect "$charlie_uri"
40swap-alice-lncli openchannel --local_amt 800000 $charlie_pubkey
sleep 2

# Bob connections
40swap-bob-lncli connect "$david_uri"
40swap-bob-lncli openchannel --local_amt 1000000 $david_pubkey
sleep 2

40swap-bob-lncli connect "$eve_uri"
40swap-bob-lncli openchannel --local_amt 800000 $eve_pubkey
sleep 2

# Charlie connections
40swap-charlie-lncli connect "$frank_uri"
40swap-charlie-lncli openchannel --local_amt 800000 $frank_pubkey
sleep 2

40swap-charlie-lncli connect "$grace_uri"
40swap-charlie-lncli openchannel --local_amt 600000 $grace_pubkey
sleep 2

# David connections
40swap-david-lncli connect "$henry_uri"
40swap-david-lncli openchannel --local_amt 800000 $henry_pubkey
sleep 2

40swap-david-lncli connect "$iris_uri"
40swap-david-lncli openchannel --local_amt 600000 $iris_pubkey
sleep 2

# Eve connections
40swap-eve-lncli connect "$jack_uri"
40swap-eve-lncli openchannel --local_amt 800000 $jack_pubkey
sleep 2

# Additional hub connections for better topology
40swap-frank-lncli connect "$henry_uri"
40swap-frank-lncli openchannel --local_amt 600000 $henry_pubkey
sleep 2

40swap-grace-lncli connect "$iris_uri"
40swap-grace-lncli openchannel --local_amt 600000 $iris_pubkey
sleep 2

40swap-henry-lncli connect "$jack_uri"
40swap-henry-lncli openchannel --local_amt 600000 $jack_pubkey

echo "=== Mining blocks to confirm all channels ==="
40swap-bitcoin-cli generatetoaddress 6 $mining_addr
wait_for_chain_sync
echo "Waiting for all channels to become active..."
sleep 15

echo "=== LIGHTNING BIG NETWORK SETUP COMPLETED ==="

# Display network statistics
echo "=== NETWORK STATISTICS ==="
echo "LSP channels: $(40swap-lsp-lncli listchannels | jq '.channels | length')"
echo "User channels: $(40swap-user-lncli listchannels | jq '.channels | length')"
echo "Alice channels: $(40swap-alice-lncli listchannels | jq '.channels | length')"
echo "Bob channels: $(40swap-bob-lncli listchannels | jq '.channels | length')"
echo "Charlie channels: $(40swap-charlie-lncli listchannels | jq '.channels | length')"
echo "David channels: $(40swap-david-lncli listchannels | jq '.channels | length')"
echo "Eve channels: $(40swap-eve-lncli listchannels | jq '.channels | length')"
echo "Frank channels: $(40swap-frank-lncli listchannels | jq '.channels | length')"
echo "Grace channels: $(40swap-grace-lncli listchannels | jq '.channels | length')"
echo "Henry channels: $(40swap-henry-lncli listchannels | jq '.channels | length')"
echo "Iris channels: $(40swap-iris-lncli listchannels | jq '.channels | length')"
echo "Jack channels: $(40swap-jack-lncli listchannels | jq '.channels | length')"

echo ""
echo "=== LSP NODE CHANNEL SUMMARY ==="
40swap-lsp-lncli listchannels | jq '.channels[] | {peer_alias: .peer_alias, capacity: .capacity, active: .active, local_balance: .local_balance, remote_balance: .remote_balance}'

echo ""
echo "Network topology created successfully!"
echo "All nodes are now connected and funded for Lightning Network operations."
