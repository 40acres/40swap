# Fallback to a justfile in a parent directory
set fallback := true

###########
# Aliases #
###########
alias du := docker-up
alias drm := docker-rm

# List all the recipes
help:
    @just -l

# Install all the dependencies from the root folder
install-dependencies:
    npm install --workspaces

# Start services with docker compose
[working-directory: 'docker']
docker-up $COMPOSE_PROFILES='mempool':
    #!/usr/bin/env bash
    set -euo pipefail
    IFS=',' read -ra profiles <<< "$COMPOSE_PROFILES"
    profile_args=""
    for profile in "${profiles[@]}"; do
        profile_args="$profile_args --profile $profile"
    done
    docker compose $profile_args up -d

# Stop and remove services with docker compose
[working-directory: 'docker']
docker-rm:
    docker compose --profile '*' down  -v
    just big-network-down

# Initialize blockchain and lightning nodes
[working-directory: 'docker']
initialize-nodes: 
    ./nodes-setup.sh

# Build shared module
[working-directory: 'shared']
build-shared:
    npm run build

# Start backend
[working-directory: 'server-backend']
start-backend: build-shared
    npm run start:dev

# Start frontend
[working-directory: 'swap-frontend']
start-frontend: build-shared
    npm run start:dev

# Start backend and frontend
run: start-backend start-frontend

# Source dev aliases for testing
source-dev-aliases:
    source server-backend/dev/dev-aliases.sh

# Run command within bitcoind container
bitcoin-cli *cmd:
    docker exec --user bitcoin 40swap_bitcoind bitcoin-cli -regtest {{cmd}}

# Send to address with fee rate and generate blocks
sendtoaddress address amount:
   just bitcoin-cli -named sendtoaddress address={{address}} amount={{amount}} fee_rate=25
   just generate 6

# Send to address with fee rate and generate blocks for Liquid
elements-sendtoaddress address amount:
    just elements-cli -rpcwallet=main -named sendtoaddress address={{address}} amount={{amount}} fee_rate=25
    just generate 6

# Generate blocks for both bitcoin and liquid
generate blocks:
    docker exec --user bitcoin 40swap_bitcoind bitcoin-cli -regtest -generate {{blocks}}
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main -generate {{blocks}}

# Generate blocks(mining) for Liquid
generate-liquid blocks='1':
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main -generate {{blocks}}

# Generate blocks(mining) for Bitcoin
generate-bitcoin blocks='6':
    docker exec --user bitcoin 40swap_bitcoind bitcoin-cli -regtest -generate {{blocks}}

# Run command within lsp-lnd container
lsp-lncli *cmd:
    docker exec -it 40swap_lnd_lsp lncli -n regtest {{cmd}}

# Run command within user-lnd container
user-lncli *cmd:
    docker exec -it 40swap_lnd_user lncli -n regtest {{cmd}}

# Run command within alice-lnd container
alice-lncli *cmd:
    docker exec -it 40swap_lnd_alice lncli -n regtest {{cmd}}

# Big network node commands
bob-lncli *cmd:
    docker exec -it 40swap_lnd_bob lncli -n regtest {{cmd}}

charlie-lncli *cmd:
    docker exec -it 40swap_lnd_charlie lncli -n regtest {{cmd}}

david-lncli *cmd:
    docker exec -it 40swap_lnd_david lncli -n regtest {{cmd}}

eve-lncli *cmd:
    docker exec -it 40swap_lnd_eve lncli -n regtest {{cmd}}

frank-lncli *cmd:
    docker exec -it 40swap_lnd_frank lncli -n regtest {{cmd}}

grace-lncli *cmd:
    docker exec -it 40swap_lnd_grace lncli -n regtest {{cmd}}

henry-lncli *cmd:
    docker exec -it 40swap_lnd_henry lncli -n regtest {{cmd}}

iris-lncli *cmd:
    docker exec -it 40swap_lnd_iris lncli -n regtest {{cmd}}

jack-lncli *cmd:
    docker exec -it 40swap_lnd_jack lncli -n regtest {{cmd}}

# Run command within elements container
elements-cli *cmd:
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -rpcwallet=main {{cmd}}

# Run backend IgTests
[working-directory: 'server-backend']
test-igtest-backend: build-shared 
    npm run build && npm run test

# Format code
format:
    npm run format

# Check code formatting
check-format:
    npm run format:check

# Run linter
lint:
    npm run lint

# Check linting
check-lint:
    npm run lint:check

# Build docs
[working-directory: 'docs']
build-docs:
    docker run -v ./:/book peaceiris/mdbook:v0.4.40 build

# Stop big network services
[working-directory: 'docker']
big-network-down:
    docker compose -f docker-compose-big-network.yml down
    echo "=== Big network services stopped ==="

# Initialize complete big network with channels
[working-directory: 'docker']
initialize-big-network:
    echo "=== Starting big network services ==="
    docker compose -f docker-compose-big-network.yml up -d
    echo "=== All services ready. Setting up Lightning Network with channels ==="
    ./big-network-setup.sh

# Reset everything on normal network size
reset:
    just drm
    just build-shared
    just du
    sleep 10
    just initialize-nodes

# Reset big network
reset-big-network:
    just drm
    just build-shared
    just du COMPOSE_PROFILES='mempool,big-network'
    sleep 10
    just initialize-nodes
    sleep 10
    just initialize-big-network