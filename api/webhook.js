const express = require('express');
const line = require('@line/bot-sdk');
const { db } = require('./firebase');
const axios = require('axios');
const { get } = require('lodash');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors');

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// 添加這些中間件在其他路由之前
app.use(express.json());  // 用於解析 application/json
app.use(express.urlencoded({ extended: true }));  // 用於解析 application/x-www-form-urlencoded

app.use(cors({
  origin: '*', // 替換為你的前端域名，或用 '*' 允許所有來源
  methods: ['GET', 'POST'] // 根據需求添加其他方法，如 'PUT', 'DELETE' 等
}));
const { validateToken } = require('./middleware/auth');

// Line Webhook Endpoint
app.post('/api/webhook', validateToken, line.middleware(config), (req, res) => {
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

// 從 LINE 獲取用戶資料
const getUserProfile = async (userId) => {
  try {
    const response = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.LINE_MESSAGING_CHANNEL_TOKEN}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

// Update or create chat room
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
      // 如果聊天室已存在，更新必要的字段並增加未讀計數 (這裡我們增加了未讀計數)
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
    // ignore non-message event
    return Promise.resolve(null);
  }

  try {
    const messageText = get(event, 'message.text') || '';
    const messageStickerId = get(event, 'message.stickerId') || '';
    const messagePackageId = get(event, 'message.packageId') || '';
    // create an echoing text message
    const echo = { type: 'text', text: messageText };
    // save to firebase
    const messageData = event;
    const messageRef = db.ref('messages');
    const timestamp = new Date().toISOString();
    const userProfile = await getUserProfile(event.source.userId);



    await messageRef.push({
      ...messageData,
      senderId: event.source.userId,
      senderName: userProfile ? userProfile.displayName : 'LINE User',
      senderAvatar: userProfile ? userProfile.pictureUrl : 'https://via.placeholder.com/50',
      userId: event.source.userId,
      content: messageText,
      timestamp,
      type: event.message.type,
      status: 'received',
      chatId: event.source.userId,
      stickerId: messageStickerId,
      packageId: messagePackageId,
    });

    updateOrCreateChat(event.source.userId, userProfile, messageText, timestamp);
  } catch (err) {
    console.error(err);
  }
}

// 添加新的路由來處理 LINE 登入
app.post('/api/line-login', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      console.log('Missing code or redirectUri', code, redirectUri);
      return res.status(400).json({ error: 'Missing code or redirectUri' });
    }

    // 向 LINE 請求訪問令牌
    const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINE_CLIENT_ID,
      client_secret: process.env.LINE_CHANNEL_SECRET
    });

    const { access_token, id_token } = tokenResponse.data;

    // 獲取用戶資料
    const userProfile = await getUserProfile(access_token);

    // 生成自定義 token
    const customToken = crypto.randomBytes(32).toString('hex');

    // 存儲到 Firebase
    const tokenRef = db.ref('auth_tokens');
    await tokenRef.push({
      token: customToken,
      lineAccessToken: access_token,
      userId: userProfile.userId,
      createdAt: new Date().toISOString(),
      userProfile
    });

    res.json({ token: customToken, user: userProfile });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});

module.exports = app;
