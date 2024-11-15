const express = require('express');
const app = express();
const port = 3000; // 可以更改為你想要的埠號

// 中介軟體 (middleware)，解析 JSON 請求
app.use(express.json());

// 基本的 GET 路由
app.get('/', (req, res) => {
    res.send('Hello, Node.js server is running!');
});

// 其他路由可以在這裡添加，例如 POST, PUT, DELETE 等
app.post('/data', (req, res) => {
    const data = req.body;
    res.json({ message: 'Data received', data });
});

// 啟動伺服器
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
