# One image, two processes: web (TanStack Start / Nitro) and worker (tsx).
FROM node:22-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@12.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
# web: run migrations + idempotent seed, then serve. The worker overrides the command.
CMD ["sh", "-c", "node_modules/.bin/tsx scripts/migrate.ts && node_modules/.bin/tsx scripts/seed.ts && node .output/server/index.mjs"]
