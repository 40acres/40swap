# 40swapd
The 40swap daemon (40swapd) interacts with the lightning node to manage the swap process. It features a cli and the daemon itself, the CLI can be used to manually invoke swaps and other configuration operations.

## Configuration

You can configure the 40swap daemon using environment variables or command line arguments. Check the section below or do `40swapd -h` for more information.

## Docs (40swapd -h)
```
NAME:
   40swapd - Manage 40swap daemon and perform swaps

USAGE:
   40swapd [global options] [command [command options]]

DESCRIPTION:
   The 40swap daemon supports two database modes:
     1. Embedded: Uses an embedded PostgreSQL database. This is the default mode and requires no additional configuration. You can specify the following parameters:
        - db-data-path: Path to the database data directory       
     2. External: Connects to an external PostgreSQL database. In this mode, you must provide the following parameters:
        - db-host: Database host
        - db-user: Database username
        - db-password: Database password
        - db-name: Database name
        - db-port: Database port

COMMANDS:
   start  Start the 40swapd daemon
   swap   Swap operations
   help   Show help

GLOBAL OPTIONS:
   --db-host value       Database host (default: "embedded") [$40SWAPD_DB_HOST]
   --db-user value       Database username (default: "40swap") [$40SWAPD_DB_USER]
   --db-password value   Database password (default: "40swap") [$40SWAPD_DB_PASSWORD]
   --db-name value       Database name (default: "40swap") [$40SWAPD_DB_NAME]
   --db-port value       Database port (default: 5433) [$40SWAPD_DB_PORT]
   --db-data-path value  Database path (NOTE: This is only used for embedded databases) (default: "./.data") [$40SWAPD_DB_DATA_PATH]
   --db-keep-alive       Keep the database running after the daemon stops for embedded databases (default: false) [$40SWAPD_DB_KEEP_ALIVE]
   --lndconnect value    LND connect URI (NOTE: This is mutually exclusive with tls-cert, macaroon, and lnd-host) [$40SWAPD_LNDCONNECT]
   --grpc-port value     Grpc port where the daemon is listening (default: 50051) [$40SWAPD_GRPC_PORT]
   --server-url value    Server URL (default: "https://app.40swap.com") [$40SWAPD_SERVER_URL]
   --tls-cert value      TLS certificate file (default: "/root/.lnd/tls.cert") [$40SWAPD_TLS_CERT]
   --macaroon value      Macaroon file (default: "/root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon") [$40SWAPD_MACAROON]
   --lnd-host value      LND host (default: "localhost:10009") [$40SWAPD_LND_HOST]
   --testnet             Use testnet network (default: false) [$40SWAPD_TESTNET]
   --regtest             Use regtest network (default: false) [$40SWAPD_REGTEST]
```