# Vercel deployment: flownote-react

## Scope

- Subproject: `flownote/`
- Vercel project: `flownote-react`
- Target: production

## Commands

- `vercel whoami`
- `yarn build`
- `vercel deploy --prod --yes`
- `vercel inspect flownote-react-cbeg0yzfq-flownote-service.vercel.app`
- `curl -I https://flownote-react.vercel.app`
- `curl -I https://flownote-react.vercel.app/canvas`

## Result

- Deployment id: `dpl_Hg4s9edU6hhvQky7izhaYAL2SKGJ`
- Deployment URL: `https://flownote-react-cbeg0yzfq-flownote-service.vercel.app`
- Production alias: `https://flownote-react.vercel.app`
- Vercel inspect status: `Ready`
- `/` response: HTTP 200
- `/canvas` response: HTTP 200

## Notes

- The Vite build succeeded.
- Vite reported the existing large chunk warning for bundles over 500 KB.
