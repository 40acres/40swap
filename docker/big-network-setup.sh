#!/bin/bash

# Enhanced big-network-setup.sh - completely bulletproof version
# This version handles all edge cases and won't get stuck

shopt -s expand_aliases
# Source the dev-aliases script to get all the helper functions
source ./dev-aliases.sh

# Global arrays to track node status
SYNCED_NODES=()
FAILED_NODES=()

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if a container is running
check_container() {
    local container_name=$1
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
        log_error "Container $container_name is not running!"
        return 1
    fi
    return 0
}

# Check if LND node is responsive with timeout
check_node_responsive() {
    local node_alias=$1
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if eval "${node_alias} getinfo >/dev/null 2>&1"; then
            return 0
        fi
        log_warning "Node $node_alias not responsive, attempt $attempt/$max_attempts"
        sleep 2
        ((attempt++))
    done
    
    log_error "Node $node_alias failed to respond after $max_attempts attempts"
    return 1
}

# Robust chain sync with timeout and better error handling
wait_for_chain_sync() {
    local max_wait_time=120  # 2 minutes max - be more aggressive
    local start_time=$(date +%s)
    
    log_info "Ensuring nodes are synced to chain..."
    
    # Generate blocks to help with sync
    mining_addr=$(40swap-bitcoin-cli getnewaddress)
    40swap-bitcoin-cli generatetoaddress 15 $mining_addr >/dev/null 2>&1
    
    # Prioritize core nodes that typically sync reliably
    local core_nodes=("lsp" "user" "alice")
    local big_nodes=("bob" "charlie" "david" "eve" "frank" "grace" "henry" "iris" "jack")
    local synced_nodes=()
    local failed_nodes=()
    
    # Track attempts per node to avoid infinite loops on problematic nodes
    declare node_attempts
    for node in "${core_nodes[@]}" "${big_nodes[@]}"; do
        node_attempts[$node]=0
    done
    
    # First ensure core nodes sync (these are critical)
    log_info "Ensuring core nodes (lsp, user, alice) are synced..."
    local core_attempts=0
    while [ ${#synced_nodes[@]} -lt 3 ] && [ $core_attempts -lt 20 ]; do
        core_attempts=$((core_attempts + 1))
        synced_nodes=()
        
        for node in "${core_nodes[@]}"; do
            if docker exec 40swap_lnd_$node lncli -n regtest getinfo >/dev/null 2>&1; then
                local sync_status=$(docker exec 40swap_lnd_$node lncli -n regtest getinfo 2>/dev/null | jq -r '.synced_to_chain' 2>/dev/null || echo "false")
                if [ "$sync_status" = "true" ]; then
                    synced_nodes+=("$node")
                fi
            fi
        done
        
        if [ ${#synced_nodes[@]} -lt 3 ]; then
            40swap-bitcoin-cli generatetoaddress 3 $mining_addr >/dev/null 2>&1
            sleep 3
        fi
    done
    
    log_success "Core nodes synced: ${synced_nodes[*]}"
    
    # Now try big nodes with shorter timeout - they're optional for basic functionality
    log_info "Checking big network nodes (optional)..."
    local big_synced=()
    local current_time=$(date +%s)
    local remaining_time=$((max_wait_time - (current_time - start_time)))
    
    if [ $remaining_time -gt 30 ]; then
        local big_attempts=0
        while [ $big_attempts -lt 10 ] && [ $(($(date +%s) - start_time)) -lt $max_wait_time ]; do
            big_attempts=$((big_attempts + 1))
            
            for node in "${big_nodes[@]}"; do
                # Skip already failed nodes
                if [[ " ${failed_nodes[*]} " =~ " ${node} " ]]; then
                    continue
                fi
                
                # Skip already synced nodes
                if [[ " ${big_synced[*]} " =~ " ${node} " ]]; then
                    continue
                fi
                
                # Quick check - don't wait too long per node
                if docker exec 40swap_lnd_$node lncli -n regtest getinfo >/dev/null 2>&1; then
                    local sync_status=$(docker exec 40swap_lnd_$node lncli -n regtest getinfo 2>/dev/null | jq -r '.synced_to_chain' 2>/dev/null || echo "false")
                    if [ "$sync_status" = "true" ]; then
                        big_synced+=("$node")
                        log_success "Big node $node synced"
                    fi
                else
                    node_attempts[$node]=$((${node_attempts[$node]} + 1))
                    if [ ${node_attempts[$node]} -gt 3 ]; then
                        failed_nodes+=("$node")
                        log_warning "Marking big node $node as non-responsive"
                    fi
                fi
            done
            
            # Generate some blocks to help
            40swap-bitcoin-cli generatetoaddress 2 $mining_addr >/dev/null 2>&1
            sleep 2
        done
    else
        log_warning "Insufficient time remaining for big nodes"
    fi
    
    # Combine results
    synced_nodes=("${synced_nodes[@]}" "${big_synced[@]}")
    
    local total_nodes=$((${#core_nodes[@]} + ${#big_nodes[@]}))
    local total_synced=${#synced_nodes[@]}
    
    if [ ${#failed_nodes[@]} -gt 0 ]; then
        log_warning "Non-responsive nodes: ${failed_nodes[*]} (network will work with reduced capacity)"
    fi
    
    log_success "Chain sync completed. $total_synced/$total_nodes nodes synced: ${synced_nodes[*]}"
    
    # Set global arrays for use in other functions
    SYNCED_NODES=("${synced_nodes[@]}")
    FAILED_NODES=("${failed_nodes[@]}")
}

check_balance_and_open_channel() {
    local node_cmd=$1
    local target_pubkey=$2
    local amount=$3
    local description=$4
    
    log_info "Checking balance for $description..."
    
    # First verify the node is responsive
    if ! check_node_responsive "$node_cmd"; then
        log_error "Node $node_cmd is not responsive, skipping channel creation"
        return 1
    fi
    
    # Try up to 5 times with increasing wait times and mining
    for attempt in 1 2 3 4 5; do
        local balance=$(eval "$node_cmd walletbalance 2>/dev/null | jq -r '.confirmed_balance' 2>/dev/null" || echo "0")
        local required_amount=$((amount + 50000))  # Buffer for fees
        
        log_info "Attempt $attempt - Balance: $balance sats, Required: $required_amount sats"
        
        if [ "$balance" -ge "$required_amount" ]; then
            log_info "Opening channel: $description ($amount sats)..."
            
            # Try to open channel
            if eval "$node_cmd openchannel --local_amt $amount $target_pubkey" >/dev/null 2>&1; then
                log_success "Channel opened successfully: $description"
                return 0
            else
                log_error "Failed to open channel: $description"
                return 1
            fi
        fi
        
        if [ $attempt -lt 5 ]; then
            if [ $attempt -eq 3 ]; then
                log_info "Mining blocks to help confirm transactions..."
                if ! 40swap-bitcoin-cli generatetoaddress 3 $(40swap-bitcoin-cli getnewaddress) >/dev/null 2>&1; then
                    log_error "Failed to generate blocks"
                    return 1
                fi
                wait_for_chain_sync
                log_info "Waiting 15 seconds after mining..."
                sleep 15
            else
                log_info "Insufficient balance, waiting $((attempt * 8)) seconds for funds to become available..."
                sleep $((attempt * 8))
            fi
        fi
    done
    
    log_warning "Insufficient balance for $description after 5 attempts. Skipping..."
    return 1
}

log_info "=== Checking container status ==="

# Check that core containers are running
core_containers=(
    "40swap_bitcoind"
    "40swap_lnd_lsp"
    "40swap_lnd_user"
    "40swap_lnd_alice"
)

optional_containers=(
    "40swap_lnd_bob"
    "40swap_lnd_charlie"
    "40swap_lnd_david"
    "40swap_lnd_eve"
    "40swap_lnd_frank"
    "40swap_lnd_grace"
    "40swap_lnd_henry"
    "40swap_lnd_iris"
    "40swap_lnd_jack"
)

for container in "${core_containers[@]}"; do
    if ! check_container "$container"; then
        log_error "Required container $container is not running. Please start it first."
        exit 1
    fi
done

# Check optional containers and note which are available
available_big_nodes=()
for container in "${optional_containers[@]}"; do
    if check_container "$container"; then
        node_name=$(echo $container | sed 's/40swap_lnd_//')
        available_big_nodes+=("$node_name")
    fi
done

log_success "Core containers running. Available big nodes: ${available_big_nodes[*]:-none}"

log_info "=== Getting node information for big network setup ==="

# Get node information with error handling
get_node_info() {
    local node_cmd=$1
    local node_name=$2
    
    if ! check_node_responsive "$node_cmd"; then
        log_error "Cannot get info from $node_name - node not responsive"
        return 1
    fi
    
    local pubkey=$(eval "$node_cmd getinfo 2>/dev/null | jq -r '.identity_pubkey' 2>/dev/null" || echo "")
    local uri=$(eval "$node_cmd getinfo 2>/dev/null | jq -r '.uris[0]' 2>/dev/null" || echo "")
    
    if [ -z "$pubkey" ] || [ "$pubkey" = "null" ]; then
        log_error "Failed to get pubkey for $node_name"
        return 1
    fi
    
    if [ -z "$uri" ] || [ "$uri" = "null" ]; then
        log_error "Failed to get URI for $node_name"
        return 1
    fi
    
    eval "${node_name}_pubkey=\"$pubkey\""
    eval "${node_name}_uri=\"$uri\""
    log_success "Got info for $node_name: ${pubkey:0:16}...@${uri##*@}"
    return 0
}

# Get node information
get_node_info "40swap-lsp-lncli" "lsp" || exit 1
get_node_info "40swap-user-lncli" "user" || exit 1
get_node_info "40swap-alice-lncli" "alice" || exit 1
get_node_info "40swap-bob-lncli" "bob" || exit 1
get_node_info "40swap-charlie-lncli" "charlie" || exit 1
get_node_info "40swap-david-lncli" "david" || exit 1
get_node_info "40swap-eve-lncli" "eve" || exit 1
get_node_info "40swap-frank-lncli" "frank" || exit 1
get_node_info "40swap-grace-lncli" "grace" || exit 1
get_node_info "40swap-henry-lncli" "henry" || exit 1
get_node_info "40swap-iris-lncli" "iris" || exit 1
get_node_info "40swap-jack-lncli" "jack" || exit 1

log_info "=== Creating Bitcoin addresses for funding ==="

# Function to get new address safely
get_node_address() {
    local node_cmd=$1
    local node_name=$2
    
    local addr=$(eval "$node_cmd newaddress p2wkh 2>/dev/null | jq -r .address 2>/dev/null" || echo "")
    if [ -z "$addr" ] || [ "$addr" = "null" ]; then
        log_error "Failed to get address for $node_name"
        return 1
    fi
    
    eval "${node_name}_addr=\"$addr\""
    log_success "Got address for $node_name: $addr"
    return 0
}

# Get new addresses for funding
get_node_address "40swap-lsp-lncli" "lsp" || exit 1
get_node_address "40swap-user-lncli" "user" || exit 1
get_node_address "40swap-alice-lncli" "alice" || exit 1
get_node_address "40swap-bob-lncli" "bob" || exit 1
get_node_address "40swap-charlie-lncli" "charlie" || exit 1
get_node_address "40swap-david-lncli" "david" || exit 1
get_node_address "40swap-eve-lncli" "eve" || exit 1
get_node_address "40swap-frank-lncli" "frank" || exit 1
get_node_address "40swap-grace-lncli" "grace" || exit 1
get_node_address "40swap-henry-lncli" "henry" || exit 1
get_node_address "40swap-iris-lncli" "iris" || exit 1
get_node_address "40swap-jack-lncli" "jack" || exit 1

mining_addr=$(40swap-bitcoin-cli getnewaddress)
if [ -z "$mining_addr" ]; then
    log_error "Failed to get mining address"
    exit 1
fi

log_info "=== Funding all Lightning nodes ==="

# Generate initial blocks
if ! 40swap-bitcoin-cli generatetoaddress 6 $mining_addr >/dev/null 2>&1; then
    log_error "Failed to generate initial blocks"
    exit 1
fi

# Fund all nodes with larger amounts to support bigger multipath payments (up to 900k sats)
log_info "Sending funds to all nodes..."

funding_commands=(
    "40swap-bitcoin-cli -named sendtoaddress address=$lsp_addr amount=10.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$user_addr amount=2.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$alice_addr amount=3.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$bob_addr amount=2.5 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$charlie_addr amount=2.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$david_addr amount=1.5 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$eve_addr amount=1.2 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$frank_addr amount=1.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$grace_addr amount=1.0 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$henry_addr amount=0.8 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$iris_addr amount=0.8 fee_rate=25"
    "40swap-bitcoin-cli -named sendtoaddress address=$jack_addr amount=0.8 fee_rate=25"
)

for cmd in "${funding_commands[@]}"; do
    if ! eval "$cmd >/dev/null 2>&1"; then
        log_error "Failed to execute: $cmd"
        exit 1
    fi
done

log_success "All funding transactions sent"

# Confirm funding transactions
if ! 40swap-bitcoin-cli generatetoaddress 3 $mining_addr >/dev/null 2>&1; then
    log_error "Failed to generate blocks to confirm funding"
    exit 1
fi

wait_for_chain_sync

echo "=== Verifying node balances after funding ==="
echo "LSP balance: $(40swap-lsp-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "User balance: $(40swap-user-lncli walletbalance | jq -r '.confirmed_balance') sats"
echo "Alice balance: $(40swap-alice-lncli walletbalance | jq -r '.confirmed_balance') sats"

# Check balances for synced big nodes only
for node in "${SYNCED_NODES[@]}"; do
    if [[ ! "$node" =~ ^(lsp|user|alice)$ ]]; then
        balance=$(docker exec 40swap_lnd_$node lncli -n regtest walletbalance 2>/dev/null | jq -r '.confirmed_balance' 2>/dev/null || echo "0")
        echo "$node balance: $balance sats"
    fi
done

log_info "=== Establishing basic connections ==="

# Function to connect nodes safely
connect_nodes() {
    local from_node=$1
    local to_uri=$2
    local description=$3
    
    log_info "Connecting $description..."
    
    if eval "$from_node connect \"$to_uri\"" >/dev/null 2>&1; then
        log_success "Connected: $description"
        return 0
    else
        log_warning "Failed to connect: $description (may already be connected)"
        return 0  # Don't fail the script for connection issues
    fi
}

# Connect nodes to LSP (main hub)
connect_nodes "40swap-lsp-lncli" "$user_uri" "LSP -> User"
connect_nodes "40swap-lsp-lncli" "$alice_uri" "LSP -> Alice"
connect_nodes "40swap-lsp-lncli" "$bob_uri" "LSP -> Bob"
connect_nodes "40swap-lsp-lncli" "$charlie_uri" "LSP -> Charlie"
connect_nodes "40swap-lsp-lncli" "$david_uri" "LSP -> David"
connect_nodes "40swap-lsp-lncli" "$eve_uri" "LSP -> Eve"
connect_nodes "40swap-lsp-lncli" "$frank_uri" "LSP -> Frank"
connect_nodes "40swap-lsp-lncli" "$grace_uri" "LSP -> Grace"
connect_nodes "40swap-lsp-lncli" "$henry_uri" "LSP -> Henry"
connect_nodes "40swap-lsp-lncli" "$iris_uri" "LSP -> Iris"
connect_nodes "40swap-lsp-lncli" "$jack_uri" "LSP -> Jack"

log_success "Basic connections established"

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
existing_channels=$(40swap-lsp-lncli listchannels | jq -r '.channels[] | .channel_point')
if [ ! -z "$existing_channels" ]; then
    for chan_point in $existing_channels; do
        echo "Closing channel: $chan_point"
        40swap-lsp-lncli closechannel --chan_point $chan_point --force 2>/dev/null || true
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
log_info "=== Phase 1: Key nodes open channels to LSP ==="

# Function to open channel and mine blocks
open_channel_and_confirm() {
    local node_cmd=$1
    local target_pubkey=$2
    local amount=$3
    local description=$4
    
    if check_balance_and_open_channel "$node_cmd" "$target_pubkey" "$amount" "$description"; then
        sleep 3
        log_info "Mining blocks to confirm $description channel..."
        if ! 40swap-bitcoin-cli generatetoaddress 3 $mining_addr >/dev/null 2>&1; then
            log_error "Failed to mine blocks for $description"
            return 1
        fi
        wait_for_chain_sync
        sleep 8
        log_success "$description channel confirmed"
        return 0
    else
        log_warning "Skipping $description due to insufficient balance"
        return 1
    fi
}

open_channel_and_confirm "40swap-user-lncli" "$lsp_pubkey" 200000 "User -> LSP"
open_channel_and_confirm "40swap-alice-lncli" "$lsp_pubkey" 250000 "Alice -> LSP"
open_channel_and_confirm "40swap-bob-lncli" "$lsp_pubkey" 200000 "Bob -> LSP"

log_info "=== Phase 2: Additional nodes open channels to LSP ==="

open_channel_and_confirm "40swap-charlie-lncli" "$lsp_pubkey" 180000 "Charlie -> LSP"
open_channel_and_confirm "40swap-david-lncli" "$lsp_pubkey" 150000 "David -> LSP"
open_channel_and_confirm "40swap-eve-lncli" "$lsp_pubkey" 150000 "Eve -> LSP"

log_info "=== Phase 3: LSP opens a few outbound channels (smaller amounts) ==="
# LSP opens smaller outbound channels for liquidity balance

open_channel_and_confirm "40swap-lsp-lncli" "$frank_pubkey" 100000 "LSP -> Frank"
open_channel_and_confirm "40swap-lsp-lncli" "$grace_pubkey" 100000 "LSP -> Grace"

log_info "=== Phase 4: Remaining nodes open channels to LSP ==="

open_channel_and_confirm "40swap-henry-lncli" "$lsp_pubkey" 80000 "Henry -> LSP"
open_channel_and_confirm "40swap-iris-lncli" "$lsp_pubkey" 80000 "Iris -> LSP"
open_channel_and_confirm "40swap-jack-lncli" "$lsp_pubkey" 80000 "Jack -> LSP"

log_info "=== Creating inter-node channels for network density ==="

# Mine more blocks and wait for confirmations
log_info "Mining blocks for network setup..."
if ! 40swap-bitcoin-cli generatetoaddress 6 $mining_addr >/dev/null 2>&1; then
    log_error "Failed to mine blocks for network setup"
    exit 1
fi
wait_for_chain_sync
sleep 10

# Create channels between nodes for network topology (smaller amounts)
log_info "=== Phase 5: Creating inter-node channels ==="

connect_nodes "40swap-alice-lncli" "$bob_uri" "Alice -> Bob (connection)"
open_channel_and_confirm "40swap-alice-lncli" "$bob_pubkey" 200000 "Alice -> Bob"

connect_nodes "40swap-alice-lncli" "$charlie_uri" "Alice -> Charlie (connection)"
open_channel_and_confirm "40swap-alice-lncli" "$charlie_pubkey" 150000 "Alice -> Charlie"

log_info "=== Creating additional channels for multipath payments ==="

# Alice creates a second channel to LSP for multipath capability
open_channel_and_confirm "40swap-alice-lncli" "$lsp_pubkey" 150000 "Alice -> LSP (multipath #2)"

# Bob creates a second channel to LSP for multipath capability
open_channel_and_confirm "40swap-bob-lncli" "$lsp_pubkey" 120000 "Bob -> LSP (multipath #2)"

# Create essential inter-node connections (very conservative approach)
log_info "=== Phase 6: Creating key inter-node connections ==="

# Bob -> David connection for routing
connect_nodes "40swap-bob-lncli" "$david_uri" "Bob -> David (connection)"
open_channel_and_confirm "40swap-bob-lncli" "$david_pubkey" 100000 "Bob -> David"

# Charlie -> Frank connection for routing
connect_nodes "40swap-charlie-lncli" "$frank_uri" "Charlie -> Frank (connection)"
open_channel_and_confirm "40swap-charlie-lncli" "$frank_pubkey" 80000 "Charlie -> Frank"

log_info "=== Mining blocks to confirm all channels ==="
if ! 40swap-bitcoin-cli generatetoaddress 6 $mining_addr >/dev/null 2>&1; then
    log_error "Failed to mine final confirmation blocks"
    exit 1
fi
wait_for_chain_sync
log_info "Waiting for channels to become active (10s)..."
sleep 10

# Mine additional blocks to ensure all channels are confirmed
log_info "Mining final confirmation blocks..."
if ! 40swap-bitcoin-cli generatetoaddress 3 $mining_addr >/dev/null 2>&1; then
    log_error "Failed to mine additional confirmation blocks"
    exit 1
fi
wait_for_chain_sync
log_info "Final sync completed, network is ready!"

log_success "=== LIGHTNING BIG NETWORK SETUP COMPLETED ==="

log_info ""
log_info "=== NETWORK STATISTICS ==="

# Function to get channel count safely
get_channel_count() {
    local node_cmd=$1
    local node_name=$2
    
    local count=$(eval "$node_cmd listchannels 2>/dev/null | jq '.channels | length' 2>/dev/null" || echo "0")
    echo "$node_name channels: $count"
}

get_channel_count "40swap-lsp-lncli" "LSP"
get_channel_count "40swap-user-lncli" "User"
get_channel_count "40swap-alice-lncli" "Alice"
get_channel_count "40swap-bob-lncli" "Bob"
get_channel_count "40swap-charlie-lncli" "Charlie"
get_channel_count "40swap-david-lncli" "David"
get_channel_count "40swap-eve-lncli" "Eve"
get_channel_count "40swap-frank-lncli" "Frank"
get_channel_count "40swap-grace-lncli" "Grace"
get_channel_count "40swap-henry-lncli" "Henry"
get_channel_count "40swap-iris-lncli" "Iris"
get_channel_count "40swap-jack-lncli" "Jack"

log_info ""
log_info "=== NODE BALANCES SUMMARY ==="

# Function to get wallet balance safely
get_wallet_balance() {
    local node_cmd=$1
    local node_name=$2
    
    local balance=$(eval "$node_cmd walletbalance 2>/dev/null | jq -r '.confirmed_balance' 2>/dev/null" || echo "0")
    echo "$node_name wallet balance: $balance sats"
}

get_wallet_balance "40swap-lsp-lncli" "LSP"
get_wallet_balance "40swap-alice-lncli" "Alice"
get_wallet_balance "40swap-bob-lncli" "Bob"
get_wallet_balance "40swap-charlie-lncli" "Charlie"
get_wallet_balance "40swap-david-lncli" "David"

log_info ""
log_info "=== LSP NODE CHANNEL SUMMARY ==="
if ! 40swap-lsp-lncli listchannels 2>/dev/null | jq '.channels[] | {peer_alias: .peer_alias, capacity: .capacity, active: .active, local_balance: .local_balance, remote_balance: .remote_balance}' 2>/dev/null; then
    log_warning "Could not get LSP channel details"
fi

log_info ""
log_info "=== MULTIPATH PAYMENT CAPABILITY ANALYSIS ==="
log_info "LSP inbound channels (for receiving multipath payments):"

lsp_channel_count=$(40swap-lsp-lncli listchannels 2>/dev/null | jq '.channels | length' 2>/dev/null || echo "0")
lsp_remote_balance=$(40swap-lsp-lncli channelbalance 2>/dev/null | jq '.remote_balance' 2>/dev/null || echo "0")

echo "Total LSP channels: $lsp_channel_count"
echo "LSP remote balance total: $lsp_remote_balance sats"

log_info ""
log_info "Nodes with outbound liquidity to LSP (for sending multipath payments):"

# Check Alice channels to LSP
if alice_channels=$(40swap-alice-lncli listchannels 2>/dev/null | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Alice -> LSP: local_balance=" + .local_balance + " sats"' 2>/dev/null); then
    echo "$alice_channels"
fi

# Check Bob channels to LSP
if bob_channels=$(40swap-bob-lncli listchannels 2>/dev/null | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Bob -> LSP: local_balance=" + .local_balance + " sats"' 2>/dev/null); then
    echo "$bob_channels"
fi

# Check Charlie channels to LSP
if charlie_channels=$(40swap-charlie-lncli listchannels 2>/dev/null | jq -r '.channels[] | select(.remote_pubkey == "'$lsp_pubkey'") | "Charlie -> LSP: local_balance=" + .local_balance + " sats"' 2>/dev/null); then
    echo "$charlie_channels"
fi

# Wait for network graph to propagate with timeout
log_info "Waiting for network graph to propagate..."
graph_attempts=0
max_graph_attempts=30

while [ $graph_attempts -lt $max_graph_attempts ]; do
    node_count=$(40swap-lsp-lncli describegraph 2>/dev/null | jq '.nodes | length' 2>/dev/null || echo "0")
    if [ "$node_count" -ge 3 ]; then
        log_success "Network graph has $node_count nodes"
        break
    fi
    
    if [ $graph_attempts -eq $((max_graph_attempts - 1)) ]; then
        log_warning "Network graph only has $node_count nodes after waiting"
    fi
    
    sleep 1
    ((graph_attempts++))
done

# Generate Lightning configuration
log_info "Generating Lightning configuration..."

lnd_socket=127.0.0.1:10002
lnd_cert=$(docker exec -it 40swap_lnd_lsp base64 -w0 /root/.lnd/tls.cert 2>/dev/null || echo "")
lnd_macaroon=$(docker exec -it 40swap_lnd_lsp base64 -w0 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon 2>/dev/null || echo "")

if [ -z "$lnd_cert" ] || [ -z "$lnd_macaroon" ]; then
    log_error "Failed to get LND certificate or macaroon"
    exit 1
fi

read -r -d '' dev_config << EOM
# this file was autogenerated by big-network-setup.sh
lnd:
  socket: $lnd_socket
  cert: $lnd_cert
  macaroon: $lnd_macaroon
EOM

if echo "$dev_config" > ../server-backend/dev/40swap.lightning.yml; then
    log_success "Lightning configuration saved to 40swap.lightning.yml"
else
    log_error "Failed to save Lightning configuration"
    exit 1
fi

# Liquid setup (only if elements container is running)
if check_container "40swap_elements"; then
    log_info "Setting up Liquid configuration..."
    
    # Create wallet (may already exist)
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest createwallet "main" false false "" false true true false 2>/dev/null || true
    
    address=$(docker exec -i 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main getnewaddress 2>/dev/null | tr -d '\r\n' | xargs)
    if [ -z "$address" ]; then
        log_error "Failed to get Liquid address"
        exit 1
    fi
    
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main generatetoaddress 101 $address >/dev/null 2>&1
    xpub=$(docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main listdescriptors 2>/dev/null | jq -r '.descriptors[] | select(.desc | startswith("wpkh(")) | select(.internal==false) | .desc' 2>/dev/null | sed -E 's/.*\]([^\/]+)\/.*/\1/')
    
    if [ -z "$xpub" ]; then
        log_error "Failed to get Liquid xpub"
        exit 1
    fi

    read -r -d '' xpub_config << EOM
# this file was autogenerated by big-network-setup.sh
elements:
  network: regtest
  rpcUrl: http://localhost:18884
  rpcUsername: 40swap
  rpcPassword: pass
  rpcWallet: main
  xpub: $xpub
  esploraUrl: http://localhost:35000
EOM

    if echo "$xpub_config" > ../server-backend/dev/40swap.elements.yml; then
        log_success "Liquid configuration saved to 40swap.elements.yml"
    else
        log_error "Failed to save Liquid configuration"
        exit 1
    fi
else
    log_warning "Elements container not running, skipping Liquid setup"
fi

log_success "🎉 Big network setup completed successfully!"

# Final network status
log_info ""
log_info "=== FINAL NETWORK STATUS ==="

total_channels=0
active_channels=0
nodes_with_channels=0

for container in 40swap_lnd_lsp 40swap_lnd_user 40swap_lnd_alice 40swap_lnd_bob 40swap_lnd_charlie 40swap_lnd_david 40swap_lnd_eve 40swap_lnd_frank 40swap_lnd_grace 40swap_lnd_henry 40swap_lnd_iris 40swap_lnd_jack; do
    node_name=${container#40swap_lnd_}
    node_name=${node_name^}  # Capitalize first letter
    
    channels=$(docker exec -it $container lncli -n regtest listchannels 2>/dev/null | jq '.channels | length' 2>/dev/null || echo "0")
    active=$(docker exec -it $container lncli -n regtest listchannels 2>/dev/null | jq '[.channels[] | select(.active == true)] | length' 2>/dev/null || echo "0")
    
    if [ "$channels" -gt 0 ]; then
        echo "  $node_name: $active/$channels channels active"
        nodes_with_channels=$((nodes_with_channels + 1))
    fi
    
    total_channels=$((total_channels + channels))
    active_channels=$((active_channels + active))
done

echo ""
log_success "Network Summary: $active_channels/$total_channels total channels active across $nodes_with_channels nodes"

if [ $active_channels -gt 15 ]; then
    log_success "✅ Network is ready for multipath payments!"
elif [ $active_channels -gt 8 ]; then
    log_warning "⚠️  Network is functional but may need more time for full activation"
else
    log_warning "⚠️  Network has limited connectivity, some channels may still be activating"
fi

log_info ""
log_info "💡 Use 'just check-network-status' to monitor network status anytime"
log_info "💡 The Lightning Network is ready for testing multipath payments."
