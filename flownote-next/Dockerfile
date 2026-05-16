FROM node:22-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN rm -rf public/uploads && mkdir -p public/uploads
RUN yarn build
EXPOSE 3000
CMD ["yarn", "start"]