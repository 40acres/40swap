# Liquidity Manager Backend

Backend API for the Lightning Liquidity Manager application.

## Features

- View all Lightning Network channels with balances
- Execute swaps to move balance out of channels using Bitfinex
- Swap flow: Lightning → Bitfinex → Liquid

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
- `POST /api/swap` - Execute a swap to move balance out
- `GET /health` - Health check endpoint
