#!/bin/bash

docker build . --file server-backend/docker/Dockerfile --tag 40swap-server-backend:latest
docker build . --file swap-frontend/docker/Dockerfile --tag 40swap-swap-frontend:latest