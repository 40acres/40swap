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

check_balance_and_open_channel() {
    local node_cmd=$1
    local target_pubkey=$2
    local amount=$3
    local description=$4
    
    echo "Checking balance for $description..."
    
    # Try up to 5 times with increasing wait times and mining
    for attempt in 1 2 3 4 5; do
        local balance=$(eval "$node_cmd walletbalance" | jq -r '.confirmed_balance')
        local required_amount=$((amount + 30000))  # Reduced buffer for fees
        
        echo "Attempt $attempt - Balance: $balance sats, Required: $required_amount sats"
        
        if [ "$balance" -ge "$required_amount" ]; then
            echo "✅ Opening channel: $description ($amount sats)..."
            eval "$node_cmd openchannel --local_amt $amount $target_pubkey"
            return 0
        fi
        
        if [ $attempt -lt 5 ]; then
            if [ $attempt -eq 3 ]; then
                echo "⛏️  Mining blocks to help confirm transactions..."
                40swap-bitcoin-cli generatetoaddress 3 $(40swap-bitcoin-cli getnewaddress)
                wait_for_chain_sync
                echo "⏳ Waiting 15 seconds after mining..."
                sleep 15
            else
                echo "⏳ Insufficient balance, waiting $((attempt * 8)) seconds for funds to become available..."
                sleep $((attempt * 8))
            fi
        fi
    done
    
    echo "❌ Insufficient balance for $description after 5 attempts. Skipping..."
    return 1
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

# Fund all nodes with larger amounts to support bigger multipath payments (up to 900k sats)
40swap-bitcoin-cli -named sendtoaddress address=$lsp_addr amount=10.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$user_addr amount=2.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$alice_addr amount=3.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$bob_addr amount=2.5 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$charlie_addr amount=2.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$david_addr amount=1.5 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$eve_addr amount=1.2 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$frank_addr amount=1.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$grace_addr amount=1.0 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$henry_addr amount=0.8 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$iris_addr amount=0.8 fee_rate=25
40swap-bitcoin-cli -named sendtoaddress address=$jack_addr amount=0.8 fee_rate=25

40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync

echo "=== Verifying node balances after funding ==="
echo "LSP balance: $(40swap-lsp-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "User balance: $(40swap-user-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "Alice balance: $(40swap-alice-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "Bob balance: $(40swap-bob-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "Charlie balance: $(40swap-charlie-lncli walletbalance | jq -r '.confirmed_balance') sats"

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

# Check LSP balance before opening channels
lsp_balance=$(40swap-lsp-lncli walletbalance | jq -r '.confirmed_balance')
echo "LSP confirmed balance: $lsp_balance sats"

# If LSP balance is too low, add more funds
if [ "$lsp_balance" -lt 800000000 ]; then  # Less than 8 BTC
    echo "⚠️  LSP balance is low ($lsp_balance sats), adding more funds..."
    lsp_addr_new=$(40swap-lsp-lncli newaddress p2wkh | jq -r .address)
    40swap-bitcoin-cli -named sendtoaddress address=$lsp_addr_new amount=5.0 fee_rate=25
    40swap-bitcoin-cli generatetoaddress 3 $mining_addr
    wait_for_chain_sync
    sleep 10
    lsp_balance=$(40swap-lsp-lncli walletbalance | jq -r '.confirmed_balance')
    echo "LSP balance after refunding: $lsp_balance sats"
fi

# Close any existing channels first (if they exist) to free up funds
echo "Closing any existing channels to start fresh..."
existing_channels=$(40swap-lsp-lncli listchannels | jq -r '.channels[] | .chan_id')
if [ ! -z "$existing_channels" ]; then
    for chan_id in $existing_channels; do
        echo "Closing channel: $chan_id"
        40swap-lsp-lncli closechannel --chan_id $chan_id --force 2>/dev/null || true
    done
    
    # Mine blocks to confirm closures and wait for funds to be available
    echo "Mining blocks to confirm channel closures..."
    40swap-bitcoin-cli generatetoaddress 6 $mining_addr
    wait_for_chain_sync
    echo "Waiting for funds to become available after channel closures..."
    sleep 20
    
    # Wait for LSP wallet balance to reflect closed channels
    echo "Waiting for LSP wallet balance to update..."
    for i in {1..40}; do
        lsp_balance=$(40swap-lsp-lncli walletbalance | jq -r '.confirmed_balance')
        echo "LSP balance check $i: $lsp_balance sats"
        if [ "$lsp_balance" -gt 800000000 ]; then  # 8 BTC threshold (since we funded with 10 BTC)
            echo "LSP has sufficient balance: $lsp_balance sats"
            break
        fi
        if [ $i -eq 20 ]; then
            echo "Mining additional blocks to ensure fund availability..."
            40swap-bitcoin-cli generatetoaddress 6 $mining_addr
            wait_for_chain_sync
        fi
        sleep 3
    done
fi

# New strategy: Other nodes open channels TO LSP (preserves LSP balance), with smaller channel sizes
echo "=== Phase 1: Key nodes open channels to LSP ==="
check_balance_and_open_channel "40swap-user-lncli" "$lsp_pubkey" 200000 "User -> LSP"
sleep 3

# Mine blocks after each channel to confirm immediately
echo "Mining blocks to confirm User -> LSP channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

check_balance_and_open_channel "40swap-alice-lncli" "$lsp_pubkey" 250000 "Alice -> LSP"
sleep 3

echo "Mining blocks to confirm Alice -> LSP channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

check_balance_and_open_channel "40swap-bob-lncli" "$lsp_pubkey" 200000 "Bob -> LSP"
sleep 3

echo "Mining blocks to confirm Bob -> LSP channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

echo "=== Phase 2: Additional nodes open channels to LSP ==="
check_balance_and_open_channel "40swap-charlie-lncli" "$lsp_pubkey" 180000 "Charlie -> LSP"
sleep 3

check_balance_and_open_channel "40swap-david-lncli" "$lsp_pubkey" 150000 "David -> LSP"
sleep 3

check_balance_and_open_channel "40swap-eve-lncli" "$lsp_pubkey" 150000 "Eve -> LSP"
sleep 3

# Mine blocks to confirm batch of channels
echo "Mining blocks to confirm Phase 2 channels..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 10

echo "=== Phase 3: LSP opens a few outbound channels (smaller amounts) ==="
# LSP opens smaller outbound channels for liquidity balance
check_balance_and_open_channel "40swap-lsp-lncli" "$frank_pubkey" 100000 "LSP -> Frank"
sleep 3

echo "Mining blocks to confirm LSP -> Frank channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

check_balance_and_open_channel "40swap-lsp-lncli" "$grace_pubkey" 100000 "LSP -> Grace"
sleep 3

echo "Mining blocks to confirm LSP -> Grace channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

echo "=== Phase 4: Remaining nodes open channels to LSP ==="
check_balance_and_open_channel "40swap-henry-lncli" "$lsp_pubkey" 80000 "Henry -> LSP"
sleep 3

check_balance_and_open_channel "40swap-iris-lncli" "$lsp_pubkey" 80000 "Iris -> LSP"
sleep 3

check_balance_and_open_channel "40swap-jack-lncli" "$lsp_pubkey" 80000 "Jack -> LSP"
sleep 3

40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync

echo "=== Creating inter-node channels for network density ==="

# Mine more blocks and wait for confirmations
40swap-bitcoin-cli generatetoaddress 6 $mining_addr
wait_for_chain_sync
sleep 10

# Create channels between nodes for network topology (smaller amounts)
echo "=== Phase 5: Creating inter-node channels ==="
echo "Connecting Alice to other nodes..."
40swap-alice-lncli connect "$bob_uri" 2>/dev/null || true
sleep 2

check_balance_and_open_channel "40swap-alice-lncli" "$bob_pubkey" 200000 "Alice -> Bob"
sleep 3

echo "Mining blocks to confirm Alice -> Bob channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

40swap-alice-lncli connect "$charlie_uri" 2>/dev/null || true
sleep 2

check_balance_and_open_channel "40swap-alice-lncli" "$charlie_pubkey" 150000 "Alice -> Charlie"
sleep 3

echo "Mining blocks to confirm Alice -> Charlie channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

echo "=== Creating additional channels for multipath payments ==="

# Alice creates a second channel to LSP for multipath capability
check_balance_and_open_channel "40swap-alice-lncli" "$lsp_pubkey" 150000 "Alice -> LSP (multipath #2)"
sleep 3

echo "Mining blocks to confirm Alice multipath channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

# Bob creates a second channel to LSP for multipath capability
check_balance_and_open_channel "40swap-bob-lncli" "$lsp_pubkey" 120000 "Bob -> LSP (multipath #2)"
sleep 3

echo "Mining blocks to confirm Bob multipath channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

# Create essential inter-node connections (very conservative approach)
echo "=== Phase 6: Creating key inter-node connections ==="

# Bob -> David connection for routing
echo "Connecting Bob to David..."
40swap-bob-lncli connect "$david_uri"
check_balance_and_open_channel "40swap-bob-lncli" "$david_pubkey" 100000 "Bob -> David"
sleep 3

echo "Mining blocks to confirm Bob -> David channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

# Charlie -> Frank connection for routing
echo "Connecting Charlie to Frank..."
40swap-charlie-lncli connect "$frank_uri"
check_balance_and_open_channel "40swap-charlie-lncli" "$frank_pubkey" 80000 "Charlie -> Frank"
sleep 3

echo "Mining blocks to confirm Charlie -> Frank channel..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 8

echo "=== Mining blocks to confirm all channels ==="
40swap-bitcoin-cli generatetoaddress 6 $mining_addr
wait_for_chain_sync
echo "Waiting for all channels to become active..."
sleep 20

# Mine additional blocks to ensure all channels are confirmed
echo "Mining additional blocks for channel confirmations..."
40swap-bitcoin-cli generatetoaddress 3 $mining_addr
wait_for_chain_sync
sleep 10

echo "=== LIGHTNING BIG NETWORK SETUP COMPLETED ==="

echo ""
echo "=== NETWORK STATISTICS ==="
echo "LSP channels: $(docker exec -it 40swap_lnd_lsp lncli -n regtest listchannels | jq '.channels | length')"
echo "User channels: $(docker exec -it 40swap_lnd_user lncli -n regtest listchannels | jq '.channels | length')"
echo "Alice channels: $(docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq '.channels | length')"
echo "Bob channels: $(docker exec -it 40swap_lnd_bob lncli -n regtest listchannels | jq '.channels | length')"
echo "Charlie channels: $(docker exec -it 40swap_lnd_charlie lncli -n regtest listchannels | jq '.channels | length')"
echo "David channels: $(docker exec -it 40swap_lnd_david lncli -n regtest listchannels | jq '.channels | length')"
echo "Eve channels: $(docker exec -it 40swap_lnd_eve lncli -n regtest listchannels | jq '.channels | length')"
echo "Frank channels: $(docker exec -it 40swap_lnd_frank lncli -n regtest listchannels | jq '.channels | length')"
echo "Grace channels: $(docker exec -it 40swap_lnd_grace lncli -n regtest listchannels | jq '.channels | length')"
echo "Henry channels: $(docker exec -it 40swap_lnd_henry lncli -n regtest listchannels | jq '.channels | length')"
echo "Iris channels: $(docker exec -it 40swap_lnd_iris lncli -n regtest listchannels | jq '.channels | length')"
echo "Jack channels: $(docker exec -it 40swap_lnd_jack lncli -n regtest listchannels | jq '.channels | length')"

echo ""
echo "=== NODE BALANCES SUMMARY ==="
echo "LSP wallet balance: $(docker exec -it 40swap_lnd_lsp lncli -n regtest walletbalance | jq -r '.confirmed_balance') sats"
echo "Alice wallet balance: $(docker exec -it 40swap_lnd_alice lncli -n regtest walletbalance | jq -r '.confirmed_balance') sats"
echo "Bob wallet balance: $(docker exec -it 40swap_lnd_bob lncli -n regtest walletbalance | jq -r '.confirmed_balance') sats"
echo "Charlie wallet balance: $(docker exec -it 40swap_lnd_charlie lncli -n regtest walletbalance | jq -r '.confirmed_balance') sats"
echo "David wallet balance: $(docker exec -it 40swap_lnd_david lncli -n regtest walletbalance | jq -r '.confirmed_balance') sats"

echo ""
echo "=== LSP NODE CHANNEL SUMMARY ==="
docker exec -it 40swap_lnd_lsp lncli -n regtest listchannels | jq '.channels[] | {peer_alias: .peer_alias, capacity: .capacity, active: .active, local_balance: .local_balance, remote_balance: .remote_balance}'

echo ""
echo "=== MULTIPATH PAYMENT CAPABILITY ANALYSIS ==="
echo "LSP inbound channels (for receiving multipath payments):"
echo "Total LSP channels: $(docker exec -it 40swap_lnd_lsp lncli -n regtest listchannels | jq '.channels | length')"
echo "LSP remote balance total: $(docker exec -it 40swap_lnd_lsp lncli -n regtest channelbalance | jq '.remote_balance') sats"
echo ""
echo "Nodes with outbound liquidity to LSP (for sending multipath payments):"
docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Alice -> LSP: local_balance=" + .local_balance + " sats"'
docker exec -it 40swap_lnd_bob lncli -n regtest listchannels | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Bob -> LSP: local_balance=" + .local_balance + " sats"'
docker exec -it 40swap_lnd_charlie lncli -n regtest listchannels | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Charlie -> LSP: local_balance=" + .local_balance + " sats"'

echo ""
echo "=== MULTIPATH READINESS CHECK ==="
alice_to_lsp_channels=$(docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq '[.channels[] | select(.remote_pubkey == "'$lsp_pubkey'")] | length')
alice_total_balance=$(docker exec -it 40swap_lnd_alice lncli -n regtest channelbalance | jq -r '.local_balance.sat // .local_balance')

# Also check indirect paths via Bob, Charlie, David
alice_paths_count=0
if [ $(docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq '[.channels[] | select(.remote_pubkey == "'$bob_pubkey'")] | length') -gt 0 ]; then
    alice_paths_count=$((alice_paths_count + 1))
fi
if [ $(docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq '[.channels[] | select(.remote_pubkey == "'$charlie_pubkey'")] | length') -gt 0 ]; then
    alice_paths_count=$((alice_paths_count + 1))
fi
if [ $(docker exec -it 40swap_lnd_alice lncli -n regtest listchannels | jq '[.channels[] | select(.remote_pubkey == "'$david_pubkey'")] | length') -gt 0 ]; then
    alice_paths_count=$((alice_paths_count + 1))
fi

echo "Alice direct channels to LSP: $alice_to_lsp_channels"
echo "Alice indirect paths to LSP (via Bob/Charlie/David): $alice_paths_count"
echo "Alice total outbound balance: $alice_total_balance sats"

total_paths=$((alice_to_lsp_channels + alice_paths_count))

if [ "$total_paths" -ge 2 ] && [ "$alice_total_balance" -gt 500000 ]; then
    echo "✅ MULTIPATH READY: Alice can send multipath payments to LSP"
    echo "   - Direct paths: $alice_to_lsp_channels"
    echo "   - Indirect paths: $alice_paths_count"
    echo "   - Total available paths: $total_paths"
    echo "💡 Recommended: Test with amounts > 300,000 sats for automatic multipath routing"
elif [ "$total_paths" -ge 1 ] && [ "$alice_total_balance" -gt 300000 ]; then
    echo "⚠️  LIMITED MULTIPATH: Alice has some payment capability but limited paths"
    echo "   - Available paths: $total_paths"
    echo "   - Consider amounts < 300,000 sats for single-path payments"
else
    echo "❌ MULTIPATH NOT READY: Alice needs more channels or balance for reliable payments"
fi


while [ $(40swap-lsp-lncli describegraph | jq '.nodes | length') -lt 3 ]
do
  sleep 0.3
done

lnd_socket=127.0.0.1:10002
lnd_cert=$(docker exec -it 40swap_lnd_lsp base64 -w0 /root/.lnd/tls.cert)
lnd_macaroon=$(docker exec -it 40swap_lnd_lsp base64 -w0 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon)

read -r -d '' dev_config << EOM
# this file was autogenerated by nodes-setup.sh
lnd:
  socket: $lnd_socket
  cert: $lnd_cert
  macaroon: $lnd_macaroon
EOM

echo "$dev_config" > ../server-backend/dev/40swap.lightning.yml

# Liquid setup:
docker exec -it 40swap_elements elements-cli -chain=liquidregtest createwallet "main" false false "" false true true false
address=$(docker exec -i 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main getnewaddress | tr -d '\r\n' | xargs)
docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main generatetoaddress 101 $address
xpub=$(docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main listdescriptors | jq -r '.descriptors[] | select(.desc | startswith("wpkh(")) | select(.internal==false) | .desc' | sed -E 's/.*\]([^\/]+)\/.*/\1/')

set the xpub of the liquid wallet
read -r -d '' xpub_config << EOM
# this file was autogenerated by nodes-setup.sh
elements:
  network: regtest
  rpcUrl: http://localhost:18884
  rpcUsername: 40swap
  rpcPassword: pass
  rpcWallet: main
  xpub: $xpub
  esploraUrl: http://localhost:35000
EOM

echo "$xpub_config" > ../server-backend/dev/40swap.elements.yml
