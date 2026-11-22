const crypto = require('crypto');

// Must be 32 bytes for AES-256
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('d0c451c768d04f82a73da224b5644e96' + '1c8678a04b654e12b00e071dc2b8b57e')
  .digest();
  const SALT = '1c8678a04b654e12b00e071dc2b8b57e'; // Use a long, random string
const IV_LENGTH = 16; // AES block size (16 bytes)

/**
 * Encrypts a string using AES-256-CBC
 * @param {string} text
 * @returns {string}
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts a string using AES-256-CBC
 * @param {string} text
 * @returns {string}
 */
function decrypt(text) {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
function generateSaltedUuid(text) {
  // Create a keyed hash (HMAC) using the key and salt
  const hash = crypto
    .createHmac('sha256', ENCRYPTION_KEY)
    .update(text.toString() + SALT)
    .digest('hex');

  // Format the hex string into a UUID structure (8-4-4-4-12)
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}
module.exports = {
  encrypt,
  decrypt,
  generateSaltedUuid
};
