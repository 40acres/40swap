# Liquidity Manager Backend

Backend API for the Lightning Liquidity Manager application.

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
