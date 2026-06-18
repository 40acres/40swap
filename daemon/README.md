# 40swapd
The 40swap daemon (40swapd) interacts with the lightning node to manage the swap process. It features a cli and the daemon itself, the CLI can be used to manually invoke swaps and other configuration operations.

## Docs

You can configure the 40swap daemon using environment variables or command line arguments. Check `40swapd -h` for more information.

# Local dev environment

## Pre-requisites
go 1.24.1 or later

## Instructions

1. Install all the dependencies from the root folder

```bash
go mod tidy
```

2. Run the daemon

```bash
just run-daemon
```

3. Create a swap in

```bash
just user-lncli addinvoice 200000 # Copy the payreq
just run swap in --payreq <payreq>

just sendtoaddress <claim address> <amount_btc> # the amount in the response of the swap in request
just generate 3
```

4. Create a swap out

```bash
just run swap out --address bcrt1q94gs370gfjut9d75ss3j7m8l7m3phs06nlqd8n --amt 200000
just generate 6
```