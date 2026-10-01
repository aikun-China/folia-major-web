// Vercel serverless function wrapper for KuGouMusicApi
const express = require('express');
// no-op listen so startService doesn't bind a port (Vercel handles routing)
const originalListen = express.application.listen;
express.application.listen = function () { return this; };

let appPromise = null;

module.exports = async (req, res) => {
  if (!appPromise) {
    const { startService } = require('../server');
    appPromise = startService().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  const app = await appPromise;
  app(req, res);
};
