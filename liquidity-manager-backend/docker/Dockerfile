FROM node:22.9.0 AS base

FROM base AS source

ARG APP="liquidity-manager-backend"
ARG NPM_COMMAND="npm --workspace=crypto-clients --workspace=$APP"

RUN mkdir -p /home/node/40swap && chown -R node:node /home/node/40swap
WORKDIR /home/node/40swap
COPY --chown=node:node ./ ./
USER node
WORKDIR /home/node/40swap
RUN $NPM_COMMAND ci --omit=dev

FROM source AS build

RUN $NPM_COMMAND ci
RUN $NPM_COMMAND run build

FROM source AS prod

COPY --chown=node:node --from=build /home/node/40swap/$APP/dist $APP/dist
COPY --chown=node:node --from=build /home/node/40swap/crypto-clients/dist crypto-clients/dist

CMD ["node", "liquidity-manager-backend/dist/main.js"]
