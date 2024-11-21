const express = require('express');
const line = require('@line/bot-sdk');
const { db } = require('./firebase');
const axios = require('axios');
const { get } = require('lodash');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

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

// 添加獲取 LINE 內容的函數
const getLineContent = async (messageId) => {
  try {
    const response = await axios.get(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_MESSAGING_CHANNEL_TOKEN}`
        },
        responseType: 'arraybuffer'
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching LINE content:', error);
    throw error;
  }
};

// 修改 handleEvent 函數
async function handleEvent(event) {
  console.log('handleEvent event:', event);
  if (event.type !== 'message') {
    return Promise.resolve(null);
  }

  try {
    const timestamp = new Date().toISOString();
    const userProfile = await getUserProfile(event.source.userId);
    let messageContent = '';
    let fileUrl = null;
    let fileName = null;
    let fileSize = null;

    // 根據消息類型處理
    switch (event.message.type) {
      case 'text':
        messageContent = event.message.text;
        break;

      case 'image':
        try {
          const imageData = await getLineContent(event.message.id);
          const imageFileName = `${event.message.id}.jpg`;
          const imagePath = path.join('/tmp', imageFileName);

          // 保存圖片到臨時目錄
          await writeFileAsync(imagePath, imageData);

          // 這裡你需要實現上傳到你的存儲服務的邏輯
          // 例如上傳到 Firebase Storage
          const storageRef = admin.storage().bucket();
          const uploadResponse = await storageRef.upload(imagePath, {
            destination: `line-images/${imageFileName}`,
            metadata: {
              contentType: 'image/jpeg',
            }
          });

          // 獲取公開訪問 URL
          fileUrl = await uploadResponse[0].getSignedUrl({
            action: 'read',
            expires: '03-01-2500'
          });

          messageContent = 'Image';
          fileName = imageFileName;

          // 清理臨時文件
          fs.unlinkSync(imagePath);
        } catch (error) {
          console.error('Error handling image:', error);
        }
        break;

      case 'file':
        try {
          const fileData = await getLineContent(event.message.id);
          const originalFileName = event.message.fileName;
          const fileExtension = path.extname(originalFileName);
          const safeFileName = `${event.message.id}${fileExtension}`;
          const filePath = path.join('/tmp', safeFileName);

          // 保存文件到臨時目錄
          await writeFileAsync(filePath, fileData);

          // 上傳到 Firebase Storage
          const storageRef = admin.storage().bucket();
          const uploadResponse = await storageRef.upload(filePath, {
            destination: `line-files/${safeFileName}`,
            metadata: {
              contentType: event.message.contentProvider.contentType,
            }
          });

          // 獲取公開訪問 URL
          fileUrl = await uploadResponse[0].getSignedUrl({
            action: 'read',
            expires: '03-01-2500'
          });

          messageContent = 'File';
          fileName = originalFileName;
          fileSize = event.message.fileSize;

          // 清理臨時文件
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error('Error handling file:', error);
        }
        break;

      case 'sticker':
        messageContent = 'Sticker';
        break;

      case 'video':
        try {
          const videoData = await getLineContent(event.message.id);
          const videoFileName = `${event.message.id}.mp4`;
          const videoPath = path.join('/tmp', videoFileName);

          // 保存視頻到臨時目錄
          await writeFileAsync(videoPath, videoData);

          // 上傳到 Firebase Storage
          const storageRef = admin.storage().bucket();
          const uploadResponse = await storageRef.upload(videoPath, {
            destination: `line-videos/${videoFileName}`,
            metadata: {
              contentType: 'video/mp4',
            }
          });

          // 獲取公開訪問 URL
          fileUrl = await uploadResponse[0].getSignedUrl({
            action: 'read',
            expires: '03-01-2500'
          });

          messageContent = 'Video';
          fileName = videoFileName;

          // 如果有縮略圖，也處理縮略圖
          if (event.message.thumbnailId) {
            const thumbnailData = await getLineContent(event.message.thumbnailId);
            const thumbnailFileName = `${event.message.id}_thumb.jpg`;
            const thumbnailPath = path.join('/tmp', thumbnailFileName);

            await writeFileAsync(thumbnailPath, thumbnailData);

            const thumbnailUpload = await storageRef.upload(thumbnailPath, {
              destination: `line-videos/thumbnails/${thumbnailFileName}`,
              metadata: {
                contentType: 'image/jpeg',
              }
            });

            const thumbnailUrl = await thumbnailUpload[0].getSignedUrl({
              action: 'read',
              expires: '03-01-2500'
            });

            // 添加縮略圖 URL 到消息數據中
            fileUrl = {
              video: fileUrl,
              thumbnail: thumbnailUrl
            };

            // 清理縮略圖臨時文件
            fs.unlinkSync(thumbnailPath);
          }

          // 清理視頻臨時文件
          fs.unlinkSync(videoPath);
        } catch (error) {
          console.error('Error handling video:', error);
          console.error('Error details:', error.response?.data);
        }
        break;

      default:
        messageContent = `Unsupported message type: ${event.message.type}`;
    }

    // 保存消息到 Firebase
    const messageRef = db.ref('messages');
    await messageRef.push({
      ...event,
      senderId: event.source.userId,
      senderName: userProfile ? userProfile.displayName : 'LINE User',
      senderAvatar: userProfile ? userProfile.pictureUrl : 'https://via.placeholder.com/50',
      userId: event.source.userId,
      content: messageContent,
      timestamp,
      type: event.message.type,
      status: 'received',
      chatId: event.source.userId,
      fileUrl,
      fileName,
      fileSize,
      stickerId: event.message.type === 'sticker' ? event.message.stickerId : null,
      packageId: event.message.type === 'sticker' ? event.message.packageId : null,
    });

    // 更新聊天室信息
    await updateOrCreateChat(
      event.source.userId,
      userProfile,
      messageContent,
      timestamp
    );

  } catch (error) {
    console.error('Error in handleEvent:', error);
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
