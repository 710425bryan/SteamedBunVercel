const express = require('express');
const line = require('@line/bot-sdk');
const { db } = require('./firebase');


const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// Line Webhook Endpoint
app.post('/api/webhook', line.middleware(config), (req, res) => {
  console.log('req.body.events', req.body.events);

  try {
    Promise.all(req.body.events.map(handleEvent))
      .then((result) => res.status(200).json(result))  // 確保回傳 200
      .catch((err) => {
        console.error('Webhook error:', error);
        res.status(200).end();
      });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// event handler
async function handleEvent(event) {
  console.log('handleEvent event:', event);
  if (event.type !== 'message') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  try {
    // create an echoing text message
    const echo = { type: 'text', text: event.message.text };
    // save to firebase
    const messageData = event;
    const messageRef = db.ref('messages');
    const timestamp = new Date().toISOString();

    await messageRef.push(messageData);

    const chatRef = db.ref(`chats/${event.source.userId}`);
    await chatRef.update({
      lastMessage: {
        content: event.message.text,
        timestamp,
      },
      unreadCount: admin.database.ServerValue.increment(1),
    });

    // use reply API
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [echo],
    });
  } catch (err) {
    console.error(err);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [echo],
    });
  }


}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});

module.exports = app;
