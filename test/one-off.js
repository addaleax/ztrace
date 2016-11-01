'use strict';

const cp = require('child_process');
const assert = require('assert');
const path = require('path');

const fixtures = path.resolve(__dirname, 'fixtures');

describe('single-object tracing', function() {
  it('can trace calls for a single object', function(done) {
    this.timeout(6000);

    const proc = cp.spawn(process.execPath, [path.join(fixtures, 'fs-one-off.js')]);

    let stderr = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', data => stderr += data);

    proc.on('close', (code, signal) => {
      assert.strictEqual(code, 0);
      assert.ok(/~.statSync\('.'\) = \{.*\}/.test(stderr));
      done();
    });
  });
});
