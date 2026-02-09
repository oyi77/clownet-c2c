# Node.js Base
FROM node:18-alpine

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
