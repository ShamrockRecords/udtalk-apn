日本語でお願いします。
動作確認を慎重に行いながら修正をしてください。

# Repository Guidelines

## Project Structure & Module Organization
`app.js` stitches Express middleware and API routes, while `bin/www` starts the HTTP server and handles graceful shutdown. Core request handlers live in `routes/api.js` (push API) and `routes/index.js` (health/status). Shared middleware (timeout, request context, error handling) sits in `middleware/`. Push delivery logic resides in `modules/push.js` with helpers in `utils/with-timeout.js`; adjust them instead of duplicating APNs/FCM code. Static assets live in `public/`, templates in `views/`, config helpers in `config/`; extend `_env` when adding environment variables.

## Build, Test, and Development Commands
- `npm install` – install dependencies; run whenever package.json changes.
- `npm start` – launch the Express server via `bin/www` (defaults to `http://localhost:3000`); requires a populated `.env`.
- `DEBUG=otomi-net:* npm start` – enable verbose server logging to trace slow push flows.

## Coding Style & Naming Conventions
Code follows Node.js CommonJS modules, 2-space indentation, single quotes, and trailing semicolons. Prefer `const`/`let` over `var` and keep async flows promise-based (`async/await`) using the `wrap` helper from `routes/api.js`. Export plain functions from new modules and name them with `camelCase`. Environment variables stay uppercase with `_` separators; surface new values through `_env`.

## Testing Guidelines
There is no automated runner yet; add Jest + Supertest suites under `tests/` when contributing new endpoints or push providers, and register them under `npm test`. Cover timeout behaviour by stubbing Firestore/Admin SDK and asserting error codes. For manual smoke tests, run the server and exercise endpoints with curl, e.g. `curl -X POST http://localhost:3000/api/registerDevice -H 'x-api-key: <key>' -d '{...}'`. Use Firebase Emulator Suite to avoid touching production data.

## Commit & Pull Request Guidelines
Existing history uses short, descriptive summaries (often Japanese full sentences). Match that tone or provide a concise English imperative line, max ~65 characters, followed by optional detail in the body. Reference issue IDs when applicable. Pull requests should include: purpose and approach, configuration changes (especially new env vars), testing proof (curl/Jest output), and deployment considerations. Request review before merging and avoid committing credentials.

## Configuration Notes
Keep sensitive values in `.env` only; `_env` is the template to extend. Timeouts live in `config/timeouts.js`—bump defaults thoughtfully and document rationale. When integrating new push providers, recycle the `with-timeout` utility and register a cleanup handler similar to `modules/push.js` to ensure graceful shutdown.
