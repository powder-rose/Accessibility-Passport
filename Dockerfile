FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir data && chown node:node data
COPY --from=build /app/dist ./dist
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/site.sqlite
EXPOSE 3000
CMD ["npm", "start"]
