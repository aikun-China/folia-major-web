const fs = require('fs');
const path = require('path');
const os = require('os');

const tokenPath = path.join(os.tmpdir(), 'anonymous_token');

const readAnonymousToken = () => {
  try {
    return fs.readFileSync(tokenPath, 'utf-8').trim();
  } catch (_) {
    return '';
  }
};

if (!fs.existsSync(tokenPath)) {
  fs.writeFileSync(tokenPath, '', 'utf-8');
}

const express = require('express');

const originalListen = express.application.listen;
express.application.listen = function () {
  return this;
};

const purgeApiPackageCache = () => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('@neteasecloudmusicapienhanced')) {
      delete require.cache[key];
    }
  }
};

const ID_XOR_KEY = '3go8&$8*3*3h0k(2)2';

const encodeAnonymousUsername = (deviceId) => {
  const CryptoJS = require('crypto-js');
  let xored = '';
  for (let i = 0; i < deviceId.length; i++) {
    xored += String.fromCharCode(
      deviceId.charCodeAt(i) ^ ID_XOR_KEY.charCodeAt(i % ID_XOR_KEY.length),
    );
  }
  const digest = CryptoJS.MD5(CryptoJS.enc.Utf8.parse(xored));
  const encodedId = CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(`${deviceId} ${digest.toString(CryptoJS.enc.Base64)}`),
  );
  return encodedId;
};

const registerAnonymousViaWeapi = async () => {
  const { generateDeviceId, cookieToJson } = require(
    '@neteasecloudmusicapienhanced/api/util',
  );
  const createRequest = require('@neteasecloudmusicapienhanced/api/util/request');
  const deviceId = generateDeviceId();
  global.deviceId = deviceId;
  const res = await createRequest(
    '/api/register/anonimous',
    { username: encodeAnonymousUsername(deviceId) },
    { crypto: 'weapi', cookie: {} },
  );
  if (!res || res.body.code !== 200 || !Array.isArray(res.cookie)) {
    throw new Error(`register failed with code ${res && res.body && res.body.code}`);
  }
  let musicA = '';
  for (const cookie of res.cookie) {
    const parsed = cookieToJson(cookie);
    if (parsed && parsed.MUSIC_A) {
      musicA = parsed.MUSIC_A;
      break;
    }
  }
  if (!musicA) {
    throw new Error('register response missing MUSIC_A cookie');
  }
  fs.writeFileSync(tokenPath, musicA, 'utf-8');
};

const bootstrapAnonymousToken = async () => {
  if (readAnonymousToken()) return;
  try {
    const generateConfig = require(
      '@neteasecloudmusicapienhanced/api/generateConfig',
    );
    await generateConfig();
    if (readAnonymousToken()) return;
    await registerAnonymousViaWeapi();
  } catch (error) {
    console.log(
      '[netease-api] anonymous token bootstrap failed:',
      error && error.message,
    );
  } finally {
    purgeApiPackageCache();
  }
  if (readAnonymousToken()) {
    console.log('[netease-api] anonymous token ready');
  } else {
    console.log('[netease-api] anonymous token unavailable, serving without it');
  }
};

const createApp = async () => {
  await bootstrapAnonymousToken();
  const { serveNcmApi } = require('@neteasecloudmusicapienhanced/api/server');
  return serveNcmApi({ checkVersion: false });
};

let appPromise = null;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = createApp().catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  const app = await appPromise;
  app(req, res);
};
