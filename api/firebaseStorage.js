const { initializeApp } = require("firebase/app");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");
const fs = require("fs");



const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_KEY);
const firebaseURL = process.env.FIREBASE_DATABASE_URL;
let storage;

if (!storage) {
  const app = initializeApp(firebaseConfig);
  storage = getStorage(app);
}


const uploadFileImage = async (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const storageRef = ref(storage, `images/${Date.now()}_${filePath.split('/').pop()}`);

    const snapshot = await uploadBytes(storageRef, fileBuffer);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL; // 返回公開可用的 URL
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }

};

module.exports = { uploadFileImage };