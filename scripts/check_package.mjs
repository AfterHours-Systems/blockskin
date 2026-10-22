// Checks what `npm publish` would ship: only the build, readme, licence and
// changelog, and nothing that pulls in three's internals or touches its
// global state.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const report = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json'], {encoding: 'utf8'}),
);
const files = report[0].files.map(file => file.path);
const allowed = /^(dist\/.+|README\.md|LICENSE|CHANGELOG\.md|package\.json)$/;
const unexpected = files.filter(file => !allowed.test(file));
const leaks = files
  .filter(file => file.endsWith('.js'))
  .filter(file =>
    /three\/src|ColorManagement\./.test(readFileSync(file, 'utf8')),
  );

if (unexpected.length || leaks.length || !files.includes('dist/index.js')) {
  console.error('Unexpected files:', unexpected);
  console.error('Files using three internals or global state:', leaks);
  process.exit(1);
}
console.log(`Package contents OK (${files.length} files).`);
