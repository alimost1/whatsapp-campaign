# WhatsApp Campaign Manager

Bulk WhatsApp messaging app with Excel contact upload, anti-spam safeguards, JWT auth, and Evolution API integration.

**Live:** https://whatsapp.executioneveryday.com

## Stack

- **Backend:** Node.js + Express, SQLite (better-sqlite3), JWT, multer, axios
- **Frontend:** React + Vite, React Router, lucide icons
- **WhatsApp gateway:** [Evolution API](https://github.com/EvolutionAPI/evolution-api) (Baileys)
- **Tunnel:** Cloudflare Tunnel (subdomain: `whatsapp.executioneveryday.com`)

## Project layout

```
whatsapp-campaign/
├── backend/
│   ├── src/
│   │   ├── index.js          Express server
│   │   ├── auth.js           JWT + bcrypt
│   │   ├── db.js             SQLite schema
│   │   ├── routes/
│   │   │   ├── auth.js       /api/auth/register, /login
│   │   │   ├── contacts.js   /api/contacts CRUD
│   │   │   ├── upload.js     /api/contacts/upload  (Excel parser)
│   │   │   ├── campaigns.js  /api/campaigns CRUD
│   │   │   └── send.js       /api/campaigns/:id/send, /whatsapp/check
│   │   └── services/
│   │       ├── evolution.js  HTTP client for Evolution API
│   │       └── antiSpam.js   Random delays + batch pauses
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx   Stats + WhatsApp connection card
│   │   │   ├── Contacts.jsx    Excel upload + contact list
│   │   │   ├── CampaignNew.jsx
│   │   │   └── CampaignHistory.jsx
│   │   └── api.js            Axios instance with auth interceptor
│   └── package.json
└── uploads/                  multer destination (gitignored)
```

## Setup

### 1. Evolution API (hosted separately on :8082)

```bash
cd /home/ubuntu/evolution-api
npm install
DATABASE_CONNECTION_URI="mysql://evolution:evolution_pass_2026@127.0.0.1:3306/evolution" \
  npx prisma migrate deploy --schema ./prisma/mysql-schema.prisma
npm start
```

### 2. Backend

```bash
cd backend
npm install
cat > .env <<EOF
PORT=3001
DB_PATH=./campaign.db
JWT_SECRET=change_me_random_string_32chars_minimum
EVOLUTION_API_URL=http://localhost:8082
EVOLUTION_API_KEY=your_evolution_api_key
FRONTEND_URL=http://localhost:5173
BASE_URL=http://localhost:3001
EOF
node src/index.js
```

### 3. Frontend

```bash
cd frontend
npm install
npm run build              # builds static dist/ served by backend
npm run dev                # OR: dev server on :5173 (proxies /api → :3001)
```

## API

### Auth
- `POST /api/auth/register` — `{email, password}` → `{token, user}`
- `POST /api/auth/login`    — `{email, password}` → `{token, user}`

### Contacts
- `GET    /api/contacts`        — list user's contacts
- `POST   /api/contacts`        — create one
- `DELETE /api/contacts/:id`    — delete
- `GET    /api/contacts/groups` — distinct group names
- `POST   /api/contacts/upload` — multipart Excel (`.xlsx`); accepts no-header sheets (column A = phone), single-column, or with header row

### Campaigns
- `POST   /api/campaigns`               — multipart: `name`, `message_text`, `contact_group?`, `image?`
- `GET    /api/campaigns`               — list
- `GET    /api/campaigns/:id`           — single (with progress fields)
- `DELETE /api/campaigns/:id`           — delete
- `POST   /api/campaigns/:id/send`      — `{instanceName}` → starts sending
- `GET    /api/campaigns/whatsapp/check?instanceName=X` — Evolution API connection state

### Anti-spam rules (see `backend/src/services/antiSpam.js`)

| Trigger | Delay |
|---|---|
| Base (every message) | 10–20 s |
| Every 20 messages | 30–60 s pause |
| Every 50 messages | 2–5 min pause |
| Daily limit (500) | 5–10 min pause |

## Evolution API instance

Create via dashboard at http://localhost:8082/manager, or programmatically:

```bash
curl -X POST http://localhost:8082/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"campaign-instance","integration":"WHATSAPP-BAILEYS","qrcode":true}'
```

Scan the QR code with WhatsApp → Settings → Linked Devices → Link a Device.

## Production deploy

Backend serves the built React SPA from `frontend/dist/`. Single port (3001) handles both API and UI. Front the app with Cloudflare Tunnel or any reverse proxy.

```
whatsapp.executioneveryday.com → cloudflared tunnel → :3001
evolution.executioneveryday.com → cloudflared tunnel → :8082
```
