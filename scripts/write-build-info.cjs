const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const outputPath = path.join(__dirname, '..', 'electron', 'buildInfo.ts');

const resolveCommitSha = () => {
  if (process.env.COMMIT_SHA) {
    return process.env.COMMIT_SHA;
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
};

const commitSha = resolveCommitSha() || 'unknown';
const contents = `export const buildInfo = {\n  commitSha: '${commitSha}'\n};\n`;

fs.writeFileSync(outputPath, contents, 'utf8');
console.info(`[build-info] commitSha=${commitSha}`);
