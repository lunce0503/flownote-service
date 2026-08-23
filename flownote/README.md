# Flownote Web

React 19와 Vite 기반 production 웹 클라이언트다. 모든 HTTP API와 Canvas Socket.IO의 공개 진입점으로 `flownote-API` 게이트웨이를 사용한다.

## 검증과 배포

```bash
yarn install --frozen-lockfile
yarn build
```

Vercel project는 `flownote-react`, production URL은 `https://flownote-react.vercel.app`이다. `VITE_*` 변수는 브라우저 번들에 포함되므로 비밀값을 넣지 않는다.
