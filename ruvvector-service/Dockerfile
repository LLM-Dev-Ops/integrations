FROM node:20-alpine AS builder

WORKDIR /app

# Copy shared database package first
COPY shared/database/package*.json ./shared/database/
COPY shared/database/tsconfig.json ./shared/database/
COPY shared/database/src ./shared/database/src

# Build shared database package
WORKDIR /app/shared/database
RUN npm install && npm run build

# Now build ruvvector-service
WORKDIR /app/ruvvector-service
COPY ruvvector-service/package*.json ./
COPY ruvvector-service/tsconfig.json ./
COPY ruvvector-service/src ./src

# Install dependencies (including local @integrations/database)
RUN npm install && npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built shared database
COPY --from=builder /app/shared/database/dist ./shared/database/dist
COPY --from=builder /app/shared/database/package.json ./shared/database/

# Copy built ruvvector-service
COPY --from=builder /app/ruvvector-service/dist ./dist
COPY --from=builder /app/ruvvector-service/package.json ./
COPY --from=builder /app/ruvvector-service/node_modules ./node_modules

# Expose port
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

# Start the service
CMD ["node", "dist/index.js"]
