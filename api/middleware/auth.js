const { db } = require('../firebase');

const validateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // 從 Firebase 檢查 token
    const tokenRef = db.ref('auth_tokens');
    const snapshot = await tokenRef.orderByChild('token').equalTo(token).once('value');
    const tokenData = snapshot.val();

    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // 將用戶信息添加到請求對象中
    req.user = Object.values(tokenData)[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { validateToken };