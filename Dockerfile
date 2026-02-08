FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

ENV DATABASE_PATH=/data/clownet.json

CMD ["node", "server.js"]
