# Пепельный Легион

Браузерная игра на TypeScript и Vite.

Десктопная версия на Electron лежит в [`desktop/`](desktop/README.md). Что уже сделано и что в планах — в [`STATUS.md`](STATUS.md).

## Локальный запуск

```sh
npm install
npm run dev
```

## Сборка

```sh
npm run build
npm run preview
```

## Деплой на Vercel

Импортируйте GitHub-репозиторий в Vercel. Framework preset: **Vite**, команда сборки: `npm run build`, папка публикации: `dist`. Переменные окружения не требуются.
