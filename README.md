# EspaceClientWeb

Frontend React + TypeScript pour l'espace client OXYDRIVER.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## Variables d'environnement

- `VITE_OXYREST_API_URL` URL publique de l'API OxyRest
- `VITE_CLIENT_TOKEN` token client généré par l'utilitaire OXYDRIVER
- `VITE_LOGROCKET_APP_ID` id LogRocket (optionnel)

## Build production

```bash
npm run build
npm run preview
```

## Déploiement Render

Utiliser `render.yaml` ou configurer :

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Variables: `VITE_OXYREST_API_URL`, `VITE_CLIENT_TOKEN`, `VITE_LOGROCKET_APP_ID`
