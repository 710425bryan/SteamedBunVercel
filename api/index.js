const express = require('express');
const cors = require('cors');
const ordersRouter = require('./orders');
const webhookRouter = require('./webhook');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 註冊路由
app.use('/api/orders', ordersRouter);
app.use('/api', webhookRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;