# Fallback to a justfile in a parent directory
set fallback := true

###########
# Aliases #
###########


alias du := docker-up
alias drm := docker-rm

# List just receipes
help:
    @just -l

# Install all the dependencies from the root folder
install-dependencies:
    npm install --workspaces

# Start services with docker compose
docker-up:
    cd server-backend/dev && docker compose up -d

# Stop and remove services with docker compose
docker-rm:
    cd server-backend/dev && docker compose down -v

# Initialize blockchain and lightning nodes
initialize-nodes:
    server-backend/dev/lightning-setup.sh

# Build shared module
build-shared:
    cd shared && npm run build

# Start backend
start-backend:
    cd server-backend && npm run start:dev

# Start frontend
start-frontend:
    cd swap-frontend && npm run start:dev

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

# Generate blocks(mining)
generate *blocks:
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