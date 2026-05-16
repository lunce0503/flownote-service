FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-alpine
WORKDIR /app
# 정적 파일을 서빙할 'serve' 패키지 설치
RUN yarn global add serve
# 빌드된 결과물만 가져오기
COPY --from=build /app/dist /app/dist

# 5173 포트로 실행, -s 옵션이 SPA 라우팅(404 방지)을 해결함
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:5173"]
