const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY);
const firebaseURL = process.env.VITE_FIREBASE_DATABASE_URL;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: firebaseURL,
  });
}


const db = admin.database();

module.exports = { db };
