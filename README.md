# 🕍 AI Interactive Passover Haggadah

An interactive digital Seder experience where participants join via link, take a selfie, and appear as AI-generated characters in scenes from the Exodus.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, TypeScript, Vanilla CSS |
| Backend | Node.js, Express, Socket.io |
| Database | Firebase Firestore (real-time) |
| Storage | Firebase Storage |
| AI Images | OpenAI DALL-E 3 |

---

## Getting Started

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create Project
2. Enable **Firestore Database** (Start in test mode for dev)
3. Enable **Storage**
4. Go to **Project Settings → Service Accounts → Generate new private key** → download JSON
5. Go to **Project Settings → General → Your apps → Add Web App** → copy config

---

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
```

Edit `.env` with your Firebase Admin credentials from the downloaded JSON:

```env
PORT=3001
OPENAI_API_KEY=sk-...
FRONTEND_URL=http://localhost:3000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

```bash
npm run dev
# Server running on http://localhost:3001
```

---

### 3. Frontend Setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
```

Edit `.env.local` with your Firebase Web App config:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

```bash
npm run dev
# Frontend at http://localhost:3000
```

---

## User Flow

```
Host → http://localhost:3000
  └─ Click "Create Seder"
  └─ Gets room URL: /join/{ROOMID}
  └─ Shares via WhatsApp
  └─ Opens /room/{ROOMID}/host

Participant → Opens /join/{ROOMID}
  └─ Takes selfie
  └─ Enters Lobby (/room/{ROOMID}/lobby)
  └─ Sees participant grid + AI hero images

Host → Clicks "Generate Scenes" (shows cost estimate)
Host → Clicks "Start Seder"
  └─ All phones auto-navigate to Reader
  └─ Host controls Next/Prev for everyone
  └─ AI scenes appear throughout

End → /room/{ROOMID}/gallery
  └─ All generated images
  └─ Download memories
```

---

## App Screens

| Screen | URL | Who |
|---|---|---|
| Landing | `/` | Host |
| Host Panel | `/room/{id}/host` | Host only |
| Join / Selfie | `/join/{id}` | Participants |
| Lobby | `/room/{id}/lobby` | Everyone |
| Reader | `/room/{id}/reader` | Everyone |
| Gallery | `/room/{id}/gallery` | Everyone |

---

## Firestore Data Model

```
rooms/{roomId}
  id: string
  hostId: string
  status: 'lobby' | 'active' | 'finished'
  currentSectionIndex: number
  participants: [{id, selfieUrl, joinedAt}]
  generatedImages: [{id, sceneId, sectionId, imageUrl, participantIds, generatedAt}]
  votes: [{id, question, choices, status, winnerId}]
```

---

## Haggadah Sections (19)

Kadesh → Urchatz → Karpas → Yachatz → Maggid → Mah Nishtanah → We Were Slaves → Four Sons → Ten Plagues → Dayenu → Pesach/Matzah/Maror → Hallel → The Meal → Afikomen → Barech → Elijah's Cup → Songs of Hallel → Nirtzah → Chad Gadya

---

## Scene Generation (23 Scenes)

Each scene has a DALL-E 3 prompt in `backend/src/haggadah/scenes.ts`. The host triggers generation from the host panel. Cost estimate is shown before generation ($0.04/image via DALL-E 3).

Lobby hero scenes (4) are generated for each participant featuring them as:
- Walking through the Red Sea
- Standing before the Pyramids  
- Holding Moses' staff
- Leading the Exodus

---

## Deployment (Render)

1. Push to GitHub
2. Create two Render services:
   - **Backend**: Web Service → `backend/` → `npm start` → add env vars
   - **Frontend**: Static Site or Web Service → `frontend/` → `npm run build` → `npm start`
3. Update `FRONTEND_URL` in backend env and `NEXT_PUBLIC_BACKEND_URL` in frontend env with live URLs

---

## חַג פֶּסַח שָׂמֵחַ! — Happy Passover! 🎉
