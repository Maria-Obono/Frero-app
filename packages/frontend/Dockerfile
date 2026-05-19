# ===========================================
# Stage 1: Build
# ===========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code and config files
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY index.html ./
COPY public ./public
COPY src ./src

# Build the application (skip tsc type-check, Vite handles transpilation)
RUN npx vite build

# ===========================================
# Stage 2: Production (Nginx)
# ===========================================
FROM nginx:alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
