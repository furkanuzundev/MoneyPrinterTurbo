FROM node:22-alpine AS builder
WORKDIR /app
COPY web/package.json web/package-lock.json ./
# Pin npm to 11.6.2: node:22-alpine's bundled npm (10.9.8) and npm >=11.7.0
# both fail `npm ci` on this lockfile with a false "Missing: @emnapi/*@1.11.2
# from lock file" EUSAGE error — a known npm regression around optional
# bundleDependencies for @tailwindcss/oxide-wasm32-wasi. 11.6.2 is confirmed
# good; revisit this pin when upgrading npm/Tailwind.
RUN npm install -g npm@11.6.2 && npm ci
COPY web ./
# Build sırasında DB gerekmez; env runtime'da gelir
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
