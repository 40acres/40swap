FROM node:22.9 AS base

FROM base AS source

ARG NPM_COMMAND="npm --workspace=shared --workspace=swap-frontend"

RUN mkdir -p /home/node/40swap && chown -R node:node /home/node/40swap
WORKDIR /home/node/40swap
COPY --chown=node:node ./ ./
USER node
WORKDIR /home/node/40swap
RUN $NPM_COMMAND ci
RUN $NPM_COMMAND run build

FROM peaceiris/mdbook:v0.4.40 AS docs

COPY docs /book
RUN mdbook build

FROM nginx:1.27.2 AS prod

COPY swap-frontend/docker/nginx.conf.template /etc/nginx/templates/40swap.conf.template
COPY --from=docs /book/book /usr/share/nginx/html/docs
COPY --from=source /home/node/40swap/swap-frontend/dist /usr/share/nginx/html/