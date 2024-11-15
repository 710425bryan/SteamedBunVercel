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

// 更新或創建聊天室
async function updateOrCreateChat(userId, userProfile, messageContent, timestamp) {
  try {
    const chatRef = db.ref(`chats/${userId}`);
    const chatSnapshot = await chatRef.once('value');
    const chatExists = chatSnapshot.exists();

    const chatData = {
      userId,
      userName: userProfile ? userProfile.displayName : '',
      userAvatar: userProfile ? userProfile.pictureUrl : 'https://via.placeholder.com/50',
      lastMessage: {
        content: messageContent,
        timestamp,
      },
      updatedAt: timestamp,
    };

    if (chatExists) {
      // 如果聊天室已存在，更新必要的字段並增加未讀計數
      await chatRef.update({
        ...chatData,
        unreadCount: admin.database.ServerValue.increment(1),
      });
    } else {
      // 如果聊天室不存在，創建新的聊天室
      await chatRef.set({
        ...chatData,
        unreadCount: 1,
        createdAt: timestamp,
      });
    }
  } catch (error) {
    console.error('Error updating/creating chat:', error);
    throw error;
  }
};

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

    await messageRef.push({
      ...messageData,
      senderId: event.source.userId,
      userId: event.source.userId,
      content: event.message.text,
      timestamp,
      type: event.message.type,
      status: 'received',
      chatId: event.source.userId,
    });

    updateOrCreateChat(event.source.userId, event.source.profile, event.message.text, timestamp);

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
