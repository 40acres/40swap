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
docker-up $COMPOSE_PROFILES='mempool-btc,esplora-liquid':
    docker compose up -d

# Stop and remove services with docker compose
[working-directory: 'docker']
docker-rm:
    docker compose --profile '*' down  -v

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
