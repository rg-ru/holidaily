import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash:password -- <PASSWORD>");
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);
console.log(passwordHash);
