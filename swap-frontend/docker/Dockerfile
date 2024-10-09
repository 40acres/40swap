FROM node:22.9 as base

FROM base as source

ARG NPM_COMMAND="npm --workspace=shared --workspace=swap-frontend"

RUN mkdir -p /home/node/40swap && chown -R node:node /home/node/40swap
WORKDIR /home/node/40swap
COPY --chown=node:node ./ ./
USER node
WORKDIR /home/node/40swap
RUN $NPM_COMMAND ci
RUN $NPM_COMMAND run build

FROM nginx:1.27.2 as prod

COPY --from=source /home/node/40swap/swap-frontend/dist /usr/share/nginx/html/