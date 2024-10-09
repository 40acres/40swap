FROM node:22.9.0 as base

FROM base as source

ARG NPM_COMMAND="npm --workspace=shared --workspace=server-backend"

RUN mkdir -p /home/node/40swap && chown -R node:node /home/node/40swap
WORKDIR /home/node/40swap
COPY --chown=node:node ./ ./
USER node
WORKDIR /home/node/40swap
RUN $NPM_COMMAND ci --omit=dev

FROM source as build

RUN $NPM_COMMAND ci
RUN $NPM_COMMAND run build

FROM source as prod

COPY --chown=node:node --from=build /home/node/40swap/server-backend/dist server-backend/dist
COPY --chown=node:node --from=build /home/node/40swap/shared/dist shared/dist

CMD ["node", "server-backend/dist/main.js"]
