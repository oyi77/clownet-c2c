# Node.js Base
FROM node:20-alpine

# Install Python and build tools for native modules (node-pty)
RUN apk add --no-cache python3 make g++

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Working Directory
WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Source Code
COPY . .

# Data Directory (for persistent volume)
RUN mkdir -p /data

# Expose Port
EXPOSE 3000

# Start Command
CMD ["node", "server.js"]
