import assert from 'node:assert/strict';
import test from 'node:test';

import { lintSource } from '../scripts/lint-client.mjs';

test('lintSource flags a deps array that references a later declaration', () => {
  const source = ['function App() {', '  useEffect(() => {}, [later]);', '  const later = 1;', '}'].join('\n');
  const problems = lintSource(source, 'bad.js');
  assert.equal(problems.length, 1);
  assert.equal(problems[0].dep, 'later');
  assert.equal(problems[0].line, 2);
  assert.equal(problems[0].declaredAt, 3);
});

test('lintSource accepts a deps array declared above the hook', () => {
  const source = ['function App() {', '  const ready = 1;', '  useEffect(() => {}, [ready]);', '}'].join('\n');
  assert.deepEqual(lintSource(source), []);
});

test('lintSource understands array destructuring declarations', () => {
  const source = ['function App() {', '  const [open, setOpen] = useState(false);', '  useEffect(() => {}, [open]);', '}'].join('\n');
  assert.deepEqual(lintSource(source), []);
});
