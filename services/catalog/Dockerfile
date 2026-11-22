# Build context: repository root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/catalog/package.json services/catalog/
RUN pnpm install --frozen-lockfile --filter @catalog/catalog-service...
COPY packages/contracts packages/contracts
COPY services/catalog services/catalog
RUN pnpm --filter @catalog/contracts build && pnpm --filter @catalog/catalog-service build \
  && pnpm --filter @catalog/catalog-service deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:3000/health/ready >/dev/null || exit 1
CMD ["node", "dist/server.js"]
