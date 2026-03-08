import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as path from 'path';
import * as fs from 'fs';

if (!getApps().length) {
    // Local dev: load from service-account.json
    // Production (Render): falls back to individual env vars
    const saPath = path.join(__dirname, '../service-account.json');

    if (fs.existsSync(saPath)) {
        const serviceAccount = require(saPath);
        initializeApp({
            credential: cert(serviceAccount),
            storageBucket: serviceAccount.project_id + '.firebasestorage.app',
        });
    } else {
        // Production — set these in Render environment variables
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
    }
}

export const db = getFirestore();
export const storage = getStorage();
