FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Local-only preview; production deployment needs identity, persistence and separate services.
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node api/server.mjs & exec npm run start -- -H 0.0.0.0"]
