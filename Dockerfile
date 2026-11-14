FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN --network=none npm run build:node

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 VITE_AUTH_ENABLED=false
COPY --from=build --chown=node:node /app/.output ./.output
COPY --chown=node:node scripts/check-amvera-db.mjs ./scripts/check-amvera-db.mjs
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", ".output/server/index.mjs"]
