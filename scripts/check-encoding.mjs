import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const roots = ["apps/web", "apps/api"];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".json"]);
const ignoredDirectories = new Set(["node_modules", ".next", "dist", "build", "coverage"]);
const mojibakePatterns = [/Ã[\u0080-\u00BF]/, /Â[\u0080-\u00BF]/, /�/];

const findings = [];

function scanDirectory(directory) {
  const entries = readdirSync(directory);
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        scanDirectory(fullPath);
      }
      continue;
    }

    if (!allowedExtensions.has(extname(entry))) {
      continue;
    }

    const content = readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber];
      if (mojibakePatterns.some((pattern) => pattern.test(line))) {
        findings.push({
          file: fullPath.replace(/\\/g, "/"),
          lineNumber: lineNumber + 1,
          line: line.trim()
        });
      }
    }
  }
}

for (const root of roots) {
  scanDirectory(root);
}

if (findings.length > 0) {
  console.error("Found possible mojibake / encoding issues:");
  for (const finding of findings.slice(0, 100)) {
    console.error(`${finding.file}:${finding.lineNumber} ${finding.line}`);
  }

  if (findings.length > 100) {
    console.error(`...and ${findings.length - 100} more.`);
  }

  process.exit(1);
}

console.log("Encoding check passed.");
