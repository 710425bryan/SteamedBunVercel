const express = require('express');
const { db } = require('./firebase');
const { validateToken } = require('./middleware/auth');
const cors = require('cors');

const app = express();
const ORDERS_PATH = 'orders';

// 中間件設置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// OPTIONS 請求處理
app.options('*', cors());

// 驗證中間件
app.use(validateToken);

// 創建訂單
app.post('/api/orders', async (req, res) => {
  try {
    const timestamp = Date.now();
    const orderNumber = `ORD${timestamp}`;
    const orderRef = db.ref(ORDERS_PATH);
    const newOrderRef = orderRef.push();

    const now = new Date().toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const orderWithMetadata = {
      ...req.body,
      id: newOrderRef.key,
      orderNumber,
      createdAt: timestamp,
      orderDate: now,
      expectedShipDate: req.body.expectedShipDate ?
        new Date(req.body.expectedShipDate).toLocaleDateString('zh-TW') : null,
      status: req.body.status || 'unprocessed',
      totalAmount: req.body.totalAmount || 0,
      userId: req.user.userId
    };

    await newOrderRef.set(orderWithMetadata);
    res.status(201).json({ id: newOrderRef.key, ...orderWithMetadata });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// 更新訂單
app.put('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderRef = db.ref(`${ORDERS_PATH}/${orderId}`);
    const updateData = { ...req.body };

    if (updateData.expectedShipDate) {
      updateData.expectedShipDate = new Date(updateData.expectedShipDate)
        .toLocaleDateString('zh-TW');
    }

    await orderRef.update(updateData);
    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// 獲取所有訂單
app.get('/api/orders', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const ordersRef = db.ref(ORDERS_PATH);
    const snapshot = await ordersRef.once('value');

    if (!snapshot.exists()) {
      return res.json([]);
    }

    let orders = Object.entries(snapshot.val()).map(([key, value]) => ({
      id: key,
      ...value
    }));

    if (status && status !== 'all') {
      orders = orders.filter(order => order.status === status);
    }

    if (startDate) {
      const startDateStr = new Date(startDate)
        .toLocaleString('zh-TW', { hour12: true });
      orders = orders.filter(order => order.orderDate >= startDateStr);
    }

    if (endDate) {
      const endDateStr = new Date(endDate)
        .toLocaleString('zh-TW', { hour12: true });
      orders = orders.filter(order => order.orderDate <= endDateStr);
    }

    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// 獲取單個訂單
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderRef = db.ref(`${ORDERS_PATH}/${orderId}`);
    const snapshot = await orderRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ id: orderId, ...snapshot.val() });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// 刪除訂單
app.delete('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderRef = db.ref(`${ORDERS_PATH}/${orderId}`);
    await orderRef.remove();
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

module.exports = app;