import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const version = packageJson.version;
let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch (e) {
  // ignore
}

console.log(`Building binary for version ${version} (${gitSha})...`);

const env = {
  ...process.env,
  BIRD_VERSION: version,
  BIRD_GIT_SHA: gitSha,
};

const result = spawnSync('bun', ['build', '--compile', '--minify', '--env=BIRD_*', 'src/cli.ts', '--outfile', 'bird'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  shell: true
});

if (result.error) {
  console.error('Failed to start bun build:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`bun build exited with code ${result.status}`);
  process.exit(result.status || 1);
}

console.log('Binary build complete.');
