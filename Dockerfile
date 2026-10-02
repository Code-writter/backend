# ==========================================
# Stage 1: Dependency Installation
# ==========================================
FROM node:20-alpine AS dependencies

WORKDIR /usr/src/app

# Install dependencies needed for potential native builds
RUN apk add --no-cache libc6-compat

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment defaults
ENV NODE_ENV=production \
    PORT=5000

# Copy node_modules from dependencies stage
COPY --from=dependencies /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY package*.json ./
COPY index.js ./

# Switch from root to unprivileged 'node' user provided by the base image
USER node

# Expose port configured in index.js
EXPOSE 5000

# Use array syntax so node runs as PID 1 and directly handles SIGTERM signals
CMD ["node", "index.js"]
