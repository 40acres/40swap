#!/bin/bash

# Reset big network script - completely resets LND data and restarts setup
# This fixes "Block height out of range" errors

set -e

# Colors for output
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

log_info "🔄 Resetting 40Swap Big Network"
log_info "==============================="
echo ""

# Stop all big network containers
log_info "Stopping big network containers..."
if docker compose -f docker-compose-big-network.yml down >/dev/null 2>&1; then
    log_success "Big network containers stopped"
else
    log_warning "Some containers may not have been running"
fi

# Remove LND data volumes for problematic nodes (keep LSP, User, Alice which are working)
log_info "Removing corrupted LND data volumes..."
volumes_to_remove=(
    "40swap_lnd-bob-data"
    "40swap_lnd-charlie-data" 
    "40swap_lnd-david-data"
    "40swap_lnd-eve-data"
    "40swap_lnd-frank-data"
    "40swap_lnd-grace-data"
    "40swap_lnd-henry-data"
    "40swap_lnd-iris-data"
    "40swap_lnd-jack-data"
)

for volume in "${volumes_to_remove[@]}"; do
    if docker volume ls | grep -q "$volume"; then
        log_info "Removing volume: $volume"
        docker volume rm "$volume" >/dev/null 2>&1 || log_warning "Failed to remove $volume"
    else
        log_info "Volume $volume doesn't exist, skipping"
    fi
done

# Restart big network services
log_info "Starting fresh big network containers..."
if docker compose -f docker-compose-big-network.yml up -d >/dev/null 2>&1; then
    log_success "Big network containers started"
else
    log_error "Failed to start big network containers"
    exit 1
fi

# Wait for containers to be ready
log_info "Waiting for containers to initialize..."
sleep 30

# Verify containers are running
containers=(
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

for container in "${containers[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "^${container}$"; then
        log_success "$container is running"
    else
        log_error "$container is NOT running"
        exit 1
    fi
done

# Wait for nodes to initialize and sync
log_info "Waiting for nodes to sync to chain..."
sleep 30

# Check if nodes are now syncing properly
log_info "Checking node synchronization status..."
for container in "${containers[@]}"; do
    node_name=${container#40swap_lnd_}
    
    for attempt in 1 2 3 4 5; do
        sync_status=$(docker exec -it $container lncli -n regtest getinfo 2>/dev/null | jq -r '.synced_to_chain' 2>/dev/null || echo "false")
        
        if [ "$sync_status" = "true" ]; then
            log_success "$node_name is synced"
            break
        else
            if [ $attempt -eq 5 ]; then
                log_warning "$node_name still not synced after reset"
                
                # Check logs for this node
                log_info "Checking logs for $node_name..."
                if docker logs $container --tail 5 2>&1 | grep -q "Block height out of range"; then
                    log_error "$node_name still has block height issues"
                else
                    log_info "$node_name may just need more time to sync"
                fi
            else
                log_info "$node_name sync attempt $attempt/5..."
                sleep 5
            fi
        fi
    done
done

log_success "Reset process completed!"
echo ""