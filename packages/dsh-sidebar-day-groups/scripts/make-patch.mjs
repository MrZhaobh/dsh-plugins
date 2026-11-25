// Regenerate patch/workspace-fork.patch from upstream/client.orig.js and
// workspace/client.js. The patch uses POSIX `a/lib/client.js` paths so
// `git apply -p1` works from a scratch package root on any host (refresh.mjs
// relies on that).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const work = join(root, '.patch-work');

rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'a', 'lib'), { recursive: true });
mkdirSync(join(work, 'b', 'lib'), { recursive: true });
writeFileSync(join(work, 'a', 'lib', 'client.js'), readFileSync(join(root, 'upstream', 'client.orig.js')));
writeFileSync(join(work, 'b', 'lib', 'client.js'), readFileSync(join(root, 'vendor', 'ui-workspace', 'client.js')));

const result = spawnSync('git', ['diff', '--no-index', '--no-color', '--no-prefix', 'a/lib/client.js', 'b/lib/client.js'], {
  cwd: work,
  encoding: 'utf8',
});
if (result.status !== 0 && result.status !== 1) {
  console.error(result.stderr);
  process.exit(2);
}
if (result.stdout.trim() === '') {
  console.error('no difference between upstream/client.orig.js and workspace/client.js');
  process.exit(2);
}

// Keep LF line endings: git rewrites added lines with CRLF when core.autocrlf is on.
const patch = result.stdout.replace(/\r\n/g, '\n');
writeFileSync(join(root, 'patch', 'workspace-fork.patch'), patch);
rmSync(work, { recursive: true, force: true });
console.log(`patch/workspace-fork.patch written (${patch.split('\n').length - 1} lines)`);
