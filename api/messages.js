const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { bucket } = require('./firebase');

// 使用 Multer 處理檔案上傳
const upload = multer({
  storage: multer.memoryStorage(), // 將檔案儲存到記憶體中
  limits: { fileSize: 5 * 1024 * 1024 }, // 設定檔案大小限制為 5MB
});


const app = express();

app.use(cors({
  origin: '*', // 替換為你的前端域名，或用 '*' 允許所有來源
  methods: ['GET', 'POST'] // 根據需求添加其他方法，如 'PUT', 'DELETE' 等
}));

app.use(express.json());



app.post('/api/messages', async (req, res) => {
  try {
    console.log('messages body:', req.body);
    const { to, messages } = req.body;

    // 檢查 messages 中的 URL
    messages.forEach(message => {
      if (message.type === 'image') {
        if (!message.originalContentUrl.startsWith('https://')) {
          throw new Error('originalContentUrl must be a valid HTTPS URL');
        }
        if (!message.previewImageUrl.startsWith('https://')) {
          throw new Error('previewImageUrl must be a valid HTTPS URL');
        }
      }
    });

    const response = await axios.post('https://api.line.me/v2/bot/message/push', {
      to,
      messages
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error sending LINE message:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to send message',
      details: error.response?.data || error.message
    });
  }
});


app.post('/api/markAsRead', async (req, res) => {
  try {
    console.log('messages body:', req.body);
    const { messageId } = req.body;
    if (!messageId) {
      return res.status(400).json({ error: 'Missing messageId' });
    }
    const response = await axios.post(`https://api.line.me/v2/bot/message/${messageId}/read`, null, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });
    console.log('成功標記為已讀:', response.status, response.data);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error sending LINE message:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to send message',
      details: error.response?.data || error.message
    });
  }
});


app.post('/api/uploadImage', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    console.log('api/uploadImage file:', file);

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // 處理檔案名稱
    const originalName = decodeURIComponent(file.originalname);
    const timestamp = Date.now();
    const fileExtension = path.extname(originalName);
    const safeFileName = `${timestamp}_${Math.random().toString(36).substring(7)}${fileExtension}`;

    // 建立臨時檔案路徑
    const tempFilePath = path.join('/tmp', safeFileName);
    const destination = `uploads/${safeFileName}`;

    // 寫入臨時檔案
    fs.writeFileSync(tempFilePath, file.buffer);

    // 上傳到 Firebase Storage
    const [uploadedFile] = await bucket.upload(tempFilePath, {
      destination,
      public: true,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: originalName // 保存原始檔名作為 metadata
        }
      }
    });

    // 刪除臨時檔案
    fs.unlinkSync(tempFilePath);

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    console.log('File uploaded successfully:', publicUrl);

    return res.status(200).json({
      success: true,
      publicUrl,
      originalName,
      fileName: safeFileName
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    return res.status(500).json({
      error: 'Failed to upload image',
      details: error.message,
      success: false,
    });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;