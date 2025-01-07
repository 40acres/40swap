40Swap
-------

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
server-backend/dev/lightning-setup.sh
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


