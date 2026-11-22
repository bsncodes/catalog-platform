# Build context: repository root.
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY services/notification/package.json services/notification/
RUN pnpm install --frozen-lockfile --filter @catalog/notification-service...
COPY packages/contracts packages/contracts
COPY services/notification services/notification
RUN pnpm --filter @catalog/contracts build && pnpm --filter @catalog/notification-service build \
  && pnpm --filter @catalog/notification-service deploy --prod --legacy /out

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 3002
HEALTHCHECK --interval=5s --timeout=3s --retries=12 CMD wget -qO- http://127.0.0.1:3002/health/ready >/dev/null || exit 1
CMD ["node", "dist/server.js"]
