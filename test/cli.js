'use strict';

const cp = require('child_process');
const assert = require('assert');
const path = require('path');

const bin = path.resolve(__dirname, '..', 'bin', 'cli.js');
const fixtures = path.resolve(__dirname, 'fixtures');

describe('ztrace', function() {
  it('shows what a program does', function(done) {
    this.timeout(60000);

    const proc = cp.spawn(process.execPath, [bin, path.join(fixtures, 'base.js')]);

    let stderr = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', data => stderr += data);

    proc.on('close', (code, signal) => {
      assert.strictEqual(code, 0);
      assert.ok(/^\s*fs\.readFile\(/m.test(stderr));
      assert.ok(/^\s*fs\.writeFile\(/m.test(stderr));
      done();
    });
  });
});
