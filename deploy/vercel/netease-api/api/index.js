// Vercel Serverless Function 入口
// 将 NeteaseCloudMusicApi 的 Express app 包装为 Vercel handler
// 关键：patch app.listen 使其在 serverless 环境中不监听端口

const fs = require('fs');
const path = require('path');
const os = require('os');

// NeteaseCloudMusicApi 在 require 时会读取 /tmp/anonymous_token
// Serverless 环境中该文件不存在，需要提前创建
const tokenPath = path.join(os.tmpdir(), 'anonymous_token');
if (!fs.existsSync(tokenPath)) {
  fs.writeFileSync(tokenPath, '', 'utf-8');
}

const express = require('express');

// 替换 listen 方法，避免在 serverless 环境中监听端口
const originalListen = express.application.listen;
express.application.listen = function () {
  return this;
};

const { serveNcmApi } = require('@neteasecloudmusicapienhanced/api/server');

let appPromise = null;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = serveNcmApi({ checkVersion: false });
  }
  const app = await appPromise;
  app(req, res);
};
