FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3100

CMD ["npx", "tsx", "src/index.ts"]
