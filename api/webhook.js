const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self' https://vercel.live"
  );
  next();
});

// Line Webhook Endpoint
app.post('/api/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.status(200).json(result))  // 確保回傳 200
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});


function handleEvent(event) {
  console.log('Received event:', event); // 記錄接收到的事件

  if (event.type === 'message' && event.message.type === 'text') {
    console.log('User message:', event.message.text); // 記錄使用者的訊息
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `你說了: ${event.message.text}`,
    });
  } else {
    return Promise.resolve(null);
  }
}

module.exports = app;
