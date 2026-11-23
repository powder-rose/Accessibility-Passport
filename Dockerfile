FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chmod=0644 package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir data && chown node:node data
COPY --from=build /app/dist ./dist
COPY --chmod=0644 scripts/database.mjs ./scripts/database.mjs
COPY --chmod=0644 scripts/lib/database-backup.mjs ./scripts/lib/database-backup.mjs
COPY --chmod=0644 scripts/healthcheck.mjs ./scripts/healthcheck.mjs
# Build context files may have restrictive host permissions (e.g. umask 077).
# Runtime code must be readable by node, but remain owned by root.
RUN chmod -R a+rX dist scripts
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/site.sqlite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=30s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["npm", "start"]
