const express = require('express');
const messages = require('./messages');

const app = express();

app.use(express.json());
app.use('/api/messages', messages);

module.exports = app;