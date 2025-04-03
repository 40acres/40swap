![40swap logo](./swap-frontend/src/assets/brand.svg)

---

# Local dev environment

## Pre-requisites

1. node 22.x (and npm)
2. docker
3. docker compose

## Instructions

1. Install all the dependencies from the root folder
```bash
npm install --workspaces
```
2. Start services with docker compose 
```bash
cd server-backend/dev
docker compose up
```
3. Initialize blockchain and lightning nodes
```bash
server-backend/dev/nodes-setup.sh
```
4. Build shared module
```bash
cd shared
npm run build
```
5. Start backend
```bash
cd server-backend
npm run start:dev
```
6. Start frontend
```bash
cd swap-frontend
npm run start:dev
```
7. Open http://localhost:7080 in your browser
8. You can check the API's' Swagger at http://localhost:7081/docs

## Testing

By sourcing [`server-backend/dev/dev-aliases.sh`](server-backend/dev/dev-aliases.sh) you can get access to some useful commands, e.g.:
```bash
source server-backend/dev/dev-aliases.sh
# mine N blocks
40swap-bitcoin-cli -generate $N
# pay lightning invoice from user node      
40swap-user-lncli payinvoice $INVOICE
# send bitcoins to adddress
40swap-bitcoin-cli -named sendtoaddress address=$ADDR amount=$AMOUNT fee_rate=25
```
