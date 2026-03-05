# CampusVoice Backend (local)

Quick start:

1. Install dependencies

```bash
cd backend
npm install
```

2. Copy `.env.example` to `.env` and update values (add real Mongo URL later)

3. Run the server

```bash
npm run dev
```

API endpoints (mounted under `/api`):

- `POST /api/auth/register` — body: `{ name?, email, password }`
- `POST /api/auth/login` — body: `{ email, password }` -> returns `{ accessToken, refreshToken }`
- `POST /api/auth/refresh` — body: `{ refreshToken }` -> returns new tokens
- `POST /api/auth/logout` — body: `{ refreshToken }`
- `GET /api/auth/me` — protected

- `GET /api/issues` — list issues
- `POST /api/issues` — create issue (protected)

Notes:
- Uses dummy `MONGO_URL` in `.env.example`. Replace with real connection string before deploying.
- Tokens are simple JWTs; refresh tokens are stored on the user record.
