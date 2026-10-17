# syntax=docker/dockerfile:1

# ---- build: compile TypeScript (src only) ----
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production deps + compiled JS + data only ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data ./data

# Run as the unprivileged user that ships with the node image.
USER node
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
