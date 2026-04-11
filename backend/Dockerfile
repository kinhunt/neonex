FROM node:20-slim

WORKDIR /app

# Railway uploads workspace root, Dockerfile is at layer1-strategy-market/backend/
# So we need to copy from the relative path
COPY layer1-strategy-market/backend/package*.json ./
RUN npm ci

COPY layer1-strategy-market/backend/ .

EXPOSE 3100

CMD ["npx", "tsx", "src/index.ts"]
