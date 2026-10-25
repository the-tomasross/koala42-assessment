# Build stage: compile native better-sqlite3 and the Astro server bundle.
FROM node:22-slim AS build
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
USER node
EXPOSE 8080
CMD ["node", "dist/server/entry.mjs"]
