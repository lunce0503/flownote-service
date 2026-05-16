FROM node:20-bookworm-slim

WORKDIR /app

ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV YARN_CACHE_FOLDER=/tmp/.yarn-cache

COPY package.json ./
RUN yarn install --non-interactive

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["yarn", "start", "--host", "lan"]
