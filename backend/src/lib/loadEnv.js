import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function loadEnvFile(fileName, { override = false } = {}) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  dotenv.config({ path: envPath, override });
}

loadEnvFile(".env");

const environmentName = process.env.APP_ENV || process.env.NODE_ENV;
if (environmentName) {
  loadEnvFile(`.env.${environmentName}`, { override: true });
}

if (process.env.NODE_ENV !== "production") {
  loadEnvFile(".env.local", { override: true });
}
