const express = require('express');
const axios = require('axios');

const app = express();

app.post('/', async (req, res) => {
  try {
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