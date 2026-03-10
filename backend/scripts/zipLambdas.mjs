import fs from "fs";
import path from "path";
import archiver from "archiver";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = path.join(__dirname, "..", "dist", "lambdas");
const outDir = path.join(__dirname, "..", "zips");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.readdirSync(distDir).forEach((lambda) => {
  const lambdaPath = path.join(distDir, lambda);
  if (!fs.statSync(lambdaPath).isDirectory()) return;
  if (lambda === "shared") return; // shared wird gebundled, kein eigenes Zip nötig

  const indexPath = path.join(lambdaPath, "index.js");
  if (!fs.existsSync(indexPath)) {
    console.error(`index.js not found for lambda ${lambda}`);
    return;
  }

  const output = fs.createWriteStream(path.join(outDir, `${lambda}.zip`));
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  // Nur das esbuild-Bundle einpacken – keine Tests, keine Buildreste
  archive.file(indexPath, { name: "index.js" });
  archive.finalize();

  console.log(`Created ${lambda}.zip with index.js`);
});