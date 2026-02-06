FROM node:22.9 AS base

FROM base AS source

ARG APP="liquidity-manager-frontend"
ARG NPM_COMMAND="npm --workspace=$APP"

RUN mkdir -p /home/node/40swap && chown -R node:node /home/node/40swap
WORKDIR /home/node/40swap
COPY --chown=node:node ./ ./
USER node
WORKDIR /home/node/40swap
RUN $NPM_COMMAND ci
RUN $NPM_COMMAND run build

FROM nginx:1.27.2 AS prod

ARG APP="liquidity-manager-frontend"
COPY $APP/docker/nginx.conf.template /etc/nginx/templates/40swap.conf.template
COPY --from=source /home/node/40swap/$APP/dist /usr/share/nginx/html/