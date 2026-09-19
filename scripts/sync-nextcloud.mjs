import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("assets/hyeonu-taemong");
fs.mkdirSync(outDir, { recursive: true });

const base = (process.env.NEXTCLOUD_BASE_URL || "").replace(/\/$/, "");
const username = process.env.NEXTCLOUD_USERNAME || "";
const password = process.env.NEXTCLOUD_APP_PASSWORD || "";
const folder = process.env.NEXTCLOUD_FOLDER || "/현우/현우의 태몽";

const existing = fs.readdirSync(outDir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
if (!base || !username || !password) {
  if (existing.length) {
    console.log("Nextcloud secrets are not configured; using repository assets.");
    process.exit(0);
  }
  throw new Error("No local images found. Configure NEXTCLOUD_BASE_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_APP_PASSWORD or add images under assets/hyeonu-taemong.");
}

const encodePath = (value) => value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
const auth = "Basic " + Buffer.from(username + ":" + password).toString("base64");
const davRoot = base + "/remote.php/dav/files/" + encodeURIComponent(username);
const folderUrl = davRoot + "/" + encodePath(folder) + "/";

const listing = await fetch(folderUrl, {
  method: "PROPFIND",
  headers: { Authorization: auth, Depth: "1", "Content-Type": "application/xml" },
  body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>'
});
if (!listing.ok) throw new Error("Nextcloud PROPFIND failed: " + listing.status + " " + listing.statusText);

const xml = await listing.text();
const hrefs = [...xml.matchAll(/<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/gi)].map((m) => m[1].replaceAll("&amp;", "&"));
let downloaded = 0;
for (const href of hrefs) {
  const decoded = decodeURIComponent(href);
  const name = decoded.split("/").filter(Boolean).at(-1);
  if (!name || !/\.(png|jpe?g|webp)$/i.test(name)) continue;
  const absolute = href.startsWith("http") ? href : new URL(href, base).toString();
  const response = await fetch(absolute, { headers: { Authorization: auth } });
  if (!response.ok) throw new Error("Failed to download " + name + ": " + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(path.join(outDir, name), bytes);
  downloaded += 1;
  console.log("Downloaded " + name + " (" + bytes.length + " bytes)");
}
if (!downloaded && !existing.length) throw new Error("No images found in Nextcloud folder " + folder);
console.log("Asset sync complete: " + downloaded + " downloaded.");
