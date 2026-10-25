# Build stage: compile native better-sqlite3 and the Astro server bundle.
FROM node:22-slim AS build
# better-sqlite3 falls back to compiling from source when no prebuilt
# binary matches; slim images ship without a toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: server bundle, production deps and the read-only database.
FROM node:22-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DB_PATH=/app/data/companies.db
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY data/companies.db ./data/companies.db
COPY data/codelists ./data/codelists
USER node
EXPOSE 8080
CMD ["node", "dist/server/entry.mjs"]
