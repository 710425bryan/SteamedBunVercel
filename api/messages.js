const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*', // 替換為你的前端域名，或用 '*' 允許所有來源
  methods: ['GET', 'POST'] // 根據需求添加其他方法，如 'PUT', 'DELETE' 等
}));

app.post('/api/messages', async (req, res) => {
  try {
    console.log('messages body:', req);
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

    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error sending LINE message:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.response?.data || error.message
    });
  }
});

module.exports = app;