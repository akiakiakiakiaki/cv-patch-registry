import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadsDirectory = path.resolve(scriptDirectory, "../public/assets/uploads");
const projectUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const uploadKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(svg|png|jpg|mp3|m4a)$/;
const contentTypes = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

if (!projectUrl || !bucket || !secret) {
  throw new Error("Set SUPABASE_URL, SUPABASE_STORAGE_BUCKET and SUPABASE_SECRET_KEY before migrating uploads.");
}

const apiKeyHeaders = { apikey: secret };
if (!secret.startsWith("sb_secret_")) apiKeyHeaders.Authorization = `Bearer ${secret}`;

let files;
try {
  files = await readdir(uploadsDirectory, { withFileTypes: true });
} catch (error) {
  if (error?.code === "ENOENT") {
    console.log("No local uploads directory found; nothing to migrate.");
    process.exit(0);
  }
  throw error;
}

const uploads = files.filter((entry) => entry.isFile() && uploadKeyPattern.test(entry.name));
let completed = 0;

for (const entry of uploads) {
  const extension = entry.name.slice(entry.name.lastIndexOf(".") + 1);
  const bytes = await readFile(path.join(uploadsDirectory, entry.name));
  const response = await fetch(
    `${projectUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(entry.name)}`,
    {
      method: "POST",
      headers: {
        ...apiKeyHeaders,
        "Content-Type": contentTypes[extension],
        "x-upsert": "true",
      },
      body: bytes,
    },
  );
  if (!response.ok) {
    throw new Error(`Upload failed for ${entry.name} with status ${response.status}`);
  }
  completed += 1;
}

console.log(`Migrated ${completed} local upload${completed === 1 ? "" : "s"} to Supabase Storage.`);
