FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars must be present at BUILD time — Next.js inlines them into the JS bundle.
ARG NEXT_PUBLIC_HA_URL=http://localhost:8123
ARG NEXT_PUBLIC_HA_TOKEN=""
ENV NEXT_PUBLIC_HA_URL=$NEXT_PUBLIC_HA_URL
ENV NEXT_PUBLIC_HA_TOKEN=$NEXT_PUBLIC_HA_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "server.js"]
