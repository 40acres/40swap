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
[working-directory: 'server-backend/dev']
docker-up $COMPOSE_PROFILES='mempool-btc,esplora-liquid':
    docker compose up -d

# Stop and remove services with docker compose
[working-directory: 'server-backend/dev']
docker-rm:
    docker compose --profile '*' down  -v

# Initialize blockchain and lightning nodes
[working-directory: 'server-backend/dev']
initialize-nodes: 
    ./lightning-setup.sh

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

elements-sendtoaddress address amount:
    just elements-cli -named sendtoaddress address={{address}} amount={{amount}} fee_rate=25
    just generate 6

# Generate blocks for both bitcoin and liquid
generate blocks:
    docker exec --user bitcoin 40swap_bitcoind bitcoin-cli -regtest -generate {{blocks}}
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -generate {{blocks}}
# Generate blocks(mining) for Liquid
generate-liquid blocks='1':
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest -generate {{blocks}}
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
elements-cli *cmd:
    docker exec -it 40swap_elements elements-cli -chain=liquidregtest  {{cmd}}