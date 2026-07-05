import { scryptSync, randomBytes } from "node:crypto";

const pw = process.argv[2];
if (!pw) {
  console.error("usage: node scripts/admin-password-hash.mjs <password>");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`scrypt:${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`);
