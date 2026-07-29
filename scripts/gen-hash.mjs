// Generate password hash for admin user using Node.js crypto
// Usage: node scripts/gen-hash.mjs <password>
import { randomBytes, pbkdf2Sync } from 'node:crypto';

const password = process.argv[2];
if (!password) {
    console.error('Usage: node scripts/gen-hash.mjs <password>');
    process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
const hashHex = hash.toString('hex');
const saltHex = salt.toString('hex');
const stored = `${saltHex}:${hashHex}`;
console.log('Hash:', stored);
