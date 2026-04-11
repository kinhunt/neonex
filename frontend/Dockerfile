FROM node:20-slim

WORKDIR /app

COPY layer1-strategy-market/frontend/package*.json ./
RUN npm ci

COPY layer1-strategy-market/frontend/ .

ARG NEXT_PUBLIC_API_BASE
ARG NEXT_PUBLIC_ENGINE_BASE
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}
ENV NEXT_PUBLIC_ENGINE_BASE=${NEXT_PUBLIC_ENGINE_BASE}

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
