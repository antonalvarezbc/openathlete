# syntax=docker/dockerfile:1.7

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy monorepo manifests for better caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY libs/shared/package.json libs/shared/package.json

# Install dependencies (Hoisted with pnpm)
RUN pnpm install --frozen-lockfile

# Copy full repo (only after deps to maximize layer cache)
COPY . .

# Build shared (required by web)
WORKDIR /app/libs/shared
RUN pnpm build

# Build web app
# Use ARG to allow passing VITE_API_BASE_URL at build time
# Empty string means use relative URLs (works with Nginx proxy)
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Optional public URLs and switches baked into the bundle
ARG VITE_WEB_URL=""
ARG VITE_WEBSITE_URL=""
ARG VITE_DISABLE_PAYMENTS=""
ENV VITE_WEB_URL=$VITE_WEB_URL
ENV VITE_WEBSITE_URL=$VITE_WEBSITE_URL
ENV VITE_DISABLE_PAYMENTS=$VITE_DISABLE_PAYMENTS

WORKDIR /app/apps/web
RUN pnpm build

# ---- Runtime stage ----
FROM nginx:alpine AS runtime

# Copy built assets
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

