# 🕍 AI Interactive Passover Haggadah (MVP)

A modern, interactive digital Seder experience with a Pearl White theme. Participants join via a shared link, take a selfie, and are automatically featured in AI-generated Exodus scenes using Leonardo AI.

## ✨ New Features
- **Modern Pearl White Theme**: Elegant glassmorphism design with an epic Exodus background.
- **Full Hebrew UI**: All Haggadah text and interface elements are in Hebrew.
- **Leonardo AI Phoenix**: Ultra-high quality biblical epic scenes generated via Leonardo AI.
- **Static Hosting Optimized**: Converted to Next.js `output: export` for free hosting on Render (Static Site).

---

## 🛠 Tech Stack
| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, TypeScript, Vanilla CSS (Pearl White Theme) |
| **Backend** | Node.js, Express, Socket.io |
| **Database** | Firebase Firestore (Real-time sync) |
| **AI Images** | Leonardo AI (Phoenix Model) |
| **Hosting** | Render (Static Site for Frontend, Web Service for Backend) |

---

## 🚀 Setup Instructions

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/) → Project `general-4686c`.
2. **Enable Firestore**: Ensure Firestore is enabled. 
3. **Enable GCP API**: Go to [Google Cloud Console](https://console.cloud.google.com/apis/library/firestore.googleapis.com) and click **Enable**.
4. **Service Account**: Go to Project Settings → Service Accounts → **Generate new private key** (Download JSON).

### 2. Deployment on Render (Free Tier)

#### **Service A: Frontend (Static Site)** 
- **Type**: Static Site
- **Repository**: `oren001/Seder_Pesah`
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `frontend/out`
- **Environment Variables**:
  | Key | Value |
  |---|---|
  | `NEXT_PUBLIC_BACKEND_URL` | *(Your Backend Render URL)* |
  | `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyCcnpQDPsQptHdZKHupXOZNqNbO1JOD1Ss` |
  | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `general-4686c` |
  | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `general-4686c.firebasestorage.app` |
  | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `810223700186` |
  | `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:810223700186:web:7eeeac4b4e0f921cd7fde3` |

#### **Service B: Backend (Web Service)** 
- **Type**: Web Service
- **Repository**: `oren001/Seder_Pesah`
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment Variables**:
  | Key | Value |
  |---|---|
  | `NODE_ENV` | `production` |
  | `FRONTEND_URL` | *(Your Frontend Render URL)* |
  | `LEONARDO_API_KEY` | `02fbccd7-7983-4275-8709-69796bb9fc6e` |
  | `FIREBASE_PROJECT_ID` | `general-4686c` |
  | `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@general-4686c.iam.gserviceaccount.com` |
  | `FIREBASE_PRIVATE_KEY` | *(Paste full key from JSON including `\n` newline markers)* |

---

## 📖 User Flow
1. **Host** creates a Seder at `Seder_Pesah.onrender.com`.
2. **Host** shares the join link (e.g., `/join/?room=ABCD`) via WhatsApp.
3. **Participants** take a selfie and enter the Lobby.
4. **Host** clicks "Generate Scenes" (Leonardo AI creates 23 unique scenes).
5. **Host** starts the Seder. All screens sync to page 1 of the Hebrew Haggadah.
6. **Interaction**: Participants vote and view AI scenes overlaying the text.
7. **End**: View/download the full Seder gallery.

---
## חַג פֶּסַח שָׂמֵחַ! 🎉
