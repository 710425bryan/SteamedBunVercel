const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY);
const firebaseURL = process.env.FIREBASE_DATABASE_URL;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: firebaseURL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}


const db = admin.database();
const bucket = admin.storage().bucket();
module.exports = { db, bucket };
