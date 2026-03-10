import fs from "fs";
import path from "path";
import esbuild from "esbuild";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = path.join(__dirname, "..");
const srcLambdasDir = path.join(rootDir, "src", "lambdas");
const distLambdasDir = path.join(rootDir, "dist", "lambdas");

if (!fs.existsSync(distLambdasDir)) {
  fs.mkdirSync(distLambdasDir, { recursive: true });
}

const lambdaDirs = fs
  .readdirSync(srcLambdasDir)
  .filter((name) => {
    const fullPath = path.join(srcLambdasDir, name);
    return (
      name !== "shared" && fs.statSync(fullPath).isDirectory()
    );
  });

async function buildAll() {
  console.log("Building lambdas with esbuild...");

  for (const lambdaName of lambdaDirs) {
    const entryPoint = path.join(srcLambdasDir, lambdaName, "index.ts");
    if (!fs.existsSync(entryPoint)) {
      console.warn(
        `Skipping lambda "${lambdaName}" – no index.ts at ${entryPoint}`,
      );
      continue;
    }

    const outdir = path.join(distLambdasDir, lambdaName);
    if (!fs.existsSync(outdir)) {
      fs.mkdirSync(outdir, { recursive: true });
    }

    console.log(`  → ${lambdaName}`);

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      outfile: path.join(outdir, "index.js"),
      sourcemap: false,
      minify: false,
      logLevel: "info",
    });
  }

  console.log("Lambdas built successfully.");
}

buildAll().catch((err) => {
  console.error("Error building lambdas with esbuild:", err);
  process.exit(1);
});

