# Build context: repository root. Builds the React app and serves it from Nginx, which also
# acts as the local API Gateway for /api/catalog.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @catalog/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @catalog/contracts build && pnpm --filter @catalog/web build

FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
