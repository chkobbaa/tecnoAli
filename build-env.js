const fs = require("fs");
const path = require("path");

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_AUTH_EMAIL: process.env.SUPABASE_AUTH_EMAIL || "",
};

const output = `window.__ENV = ${JSON.stringify(env, null, 2)};\n`;
const targetPath = path.join(__dirname, "env.js");

fs.writeFileSync(targetPath, output, "utf8");
console.log("env.js generated");
