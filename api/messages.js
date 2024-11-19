const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { bucket } = require('./firebase');

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


app.post('/api/uploadImage', async (req, res) => {
  try {
    const { file } = req.body;
    console.log('api/uploadImage file:', req.body)
    if (!file) {
      return res.status(400).json({ error: 'Missing file' });
    }
    const tempFilePath = path.join(__dirname, file.name);
    fs.writeFileSync(tempFilePath, file.buffer);

    const [uploadedFile] = await bucket.upload(tempFilePath, {
      destination, // 在 Storage 中的目標路徑
      public: true, // 設定檔案為公開
    });

    fs.unlinkSync(tempFilePath);
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    console.log('File uploaded successfully:', publicUrl);

    return res.status(200).json({ publicUrl });
  } catch (error) {
    console.error('Error sending LINE message:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Failed to upload image',
      details: error.response?.data || error.message
    });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;