import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as path from 'path';
import * as fs from 'fs';

if (!getApps().length) {
    try {
        const saPath = path.join(__dirname, '../service-account.json');
        if (fs.existsSync(saPath)) {
            const serviceAccount = require(saPath);
            // Ensure private key newlines are handled correctly regardless of JSON escaping
            if (serviceAccount.private_key) {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
            }
            initializeApp({
                credential: cert(serviceAccount),
                storageBucket: serviceAccount.project_id + '.firebasestorage.app',
            });
            console.log('✅ Firebase Admin initialized with service account file');
        } else {
            const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
            initializeApp({
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey,
                }),
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            });
            console.log('✅ Firebase Admin initialized with environment variables');
        }
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin:', err);
    }
}

export const db = getFirestore();
export const storage = getStorage();
