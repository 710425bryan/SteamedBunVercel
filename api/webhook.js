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
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

// const client = new line.messagingApi.MessagingApiClient({
//   channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
// });

const app = express();

// 這些中間件必須在 webhook 路由之前
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// 添加簽名驗證的輔助函數
const validateSignature = (body, signature, channelSecret) => {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(Buffer.from(JSON.stringify(body)))
    .digest('base64');
  return hash === signature;
};

// Line Webhook Endpoint
app.post('/api/webhook', (req, res) => {
  console.log('Received webhook request');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  const signature = req.headers['x-line-signature'];

  // 檢查簽名是否存在
  if (!signature) {
    console.error('No signature found in headers');
    return res.status(400).json({ error: 'No signature' });
  }

  // 驗證簽名
  const isValid = validateSignature(req.body, signature, config.channelSecret);
  if (!isValid) {
    console.error('Signature validation failed');
    console.error('Channel Secret:', config.channelSecret);
    console.error('Received Signature:', signature);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    Promise.all(req.body.events.map(handleEvent))
      .then((result) => res.status(200).json(result))
      .catch((error) => {
        console.error('Webhook error:', error);
        res.status(200).end();
      });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).end();
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

    console.log('Received login request:', { code, redirectUri });

    if (!code || !redirectUri) {
      console.log('Missing required parameters:', { code, redirectUri });
      return res.status(400).json({ error: 'Missing code or redirectUri' });
    }

    // 準備 LINE Token 請求的表單數據
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', process.env.LINE_CHANNEL_ID);
    params.append('client_secret', process.env.LINE_CHANNEL_SECRET);

    console.log('Requesting LINE token with params:', params.toString());

    // 向 LINE 請求訪問令牌
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('LINE token response:', tokenResponse.data);

    const { access_token, id_token } = tokenResponse.data;

    // 使用 access_token 獲取用戶資料
    const userProfile = await axios.get('https://api.line.me/v2/profile', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    console.log('User profile:', userProfile.data);

    // 生成自定義 token
    const customToken = crypto.randomBytes(32).toString('hex');

    // 存儲到 Firebase
    const tokenRef = db.ref('auth_tokens');
    await tokenRef.push({
      token: customToken,
      lineAccessToken: access_token,
      userId: userProfile.data.userId,
      createdAt: new Date().toISOString(),
      userProfile: userProfile.data
    });

    res.json({
      token: customToken,
      user: userProfile.data
    });

  } catch (error) {
    console.error('Login error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers
    });

    res.status(500).json({
      error: 'Login failed',
      details: error.response?.data || error.message
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});

module.exports = app;
