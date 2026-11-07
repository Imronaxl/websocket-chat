FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Empty API URL: the browser talks to the same origin, nginx routes /api to the backend.
ENV NEXT_PUBLIC_API_URL="" NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
