const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES = '7d';

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET || 'access_secret_dummy', { expiresIn: ACCESS_EXPIRES });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret_dummy', { expiresIn: REFRESH_EXPIRES });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET || 'access_secret_dummy');
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret_dummy');
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
