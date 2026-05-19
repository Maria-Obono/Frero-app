# ===========================================
# Stage 1: Build
# ===========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm install

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript to JavaScript
RUN npm run build

# ===========================================
# Stage 2: Production
# ===========================================
FROM node:22-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package.json ./

# Install only production dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create uploads directory and non-root user for security
RUN addgroup -g 1001 -S frero && \
    adduser -S frero -u 1001 -G frero && \
    mkdir -p /app/uploads && \
    chown -R frero:frero /app/uploads

USER frero

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the application (runs migrations then starts the server)
CMD ["node", "dist/migrate-and-start.js"]
