# Liquidity Manager Backend

Backend API for the Lightning Liquidity Manager application.

## Features

- View all Lightning Network channels with balances
- Execute swaps to move balance out of channels using multiple strategies
- **Persistent swap history** stored in PostgreSQL database
- Track swap status, outcome, and costs
- Multiple swap strategies:
  - **Dummy**: Test strategy that simulates a swap without moving funds (5 second wait)
  - **Bitfinex**: Production strategy - Lightning → Bitfinex → Liquid

## Database

The application uses PostgreSQL to persist swap history. Each swap is recorded with:
- Swap ID, status, and outcome
- Channel and peer information
- Amount swapped and estimated cost
- Timestamps (created, updated, completed)
- Liquid address and Bitfinex transaction ID
- Error messages (if failed)

### Setup Database

Create a PostgreSQL database:
```bash
createdb liquidity_manager
```

The application will automatically run migrations on startup.

## Swap Flow

The Bitfinex swap process works as follows:

1. **Get Liquid Address**: Obtains a new address from the Elements/Liquid wallet
2. **Check Deposit Addresses**: Ensures Bitfinex has Lightning deposit addresses configured
3. **Generate Invoice**: Requests a Lightning invoice from Bitfinex
4. **Pay Invoice**: Pays the invoice using LND (moves BTC out of the Lightning channel)
5. **Monitor Invoice**: Waits for Bitfinex to confirm the payment
6. **Exchange LNX→BTC**: Converts Lightning credits to BTC on Bitfinex
7. **Exchange BTC→LBT**: Converts BTC to Liquid Bitcoin (L-BTC) on Bitfinex  
8. **Withdraw**: Withdraws L-BTC to the Liquid address

## Configuration

Create a configuration file named `liquidity-manager.conf.yaml` in one of these locations:
- `./dev/` (for development)
- `~` (home directory)
- `/etc/`
- `/etc/40swap/`

Example configuration:

```yaml
server:
  port: 7082
  environment: development

db:
  host: localhost
  port: 5432
  username: postgres
  password: postgres
  database: liquidity_manager
  synchronize: false
  migrationsRun: true

lnd:
  socket: localhost:10009
  cert: /path/to/lnd/tls.cert
  macaroon: /path/to/lnd/admin.macaroon

bitfinex:
  apiKey: YOUR_API_KEY
  apiSecret: YOUR_API_SECRET

elements:
  rpcUrl: http://localhost:18884
  rpcUsername: elements
  rpcPassword: elements
  rpcWallet: swap
```

## Development

```bash
# Install dependencies (from root)
npm install

# Build LND proto files
npm run build:lnd-proto

# Start in development mode
npm run start:dev
```

## API Documentation

Once running, Swagger documentation is available at: `http://localhost:7082/api/docs`

### Endpoints

- `GET /api/channels` - List all Lightning channels
- `GET /api/swap/strategies` - Get available swap strategies
- `POST /api/swap` - Execute a swap to move balance out (requires `strategy` field)
- `GET /api/swap-history` - Get all swap history
- `GET /api/swap-history/:id` - Get specific swap details
- `GET /api/swap-history/channel/:channelId` - Get swaps for a specific channel
- `GET /health` - Health check endpoint
