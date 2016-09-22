'use strict';

const ZTrace = require('..');
const assert = require('assert');

describe('ZTrace', function() {
  it('Can hook into an object and watch its calls', function() {
    const obj = {
      method(arg) {
        return arg + 42;
      }
    };

    const infos = [];

    const ztrace = new ZTrace.ZTrace();
    ztrace.setupHooks()
      .on('enter', info => infos.push(['enter', info]))
      .on('leave', info => infos.push(['leave', info]));

    const hObj = ztrace.hookValue('obj', obj);

    const ret = hObj.method(20);
    assert.strictEqual(ret, 62);
    assert.strictEqual(infos[0][0], 'enter');
    assert.strictEqual(infos[1][0], 'leave');
    assert.strictEqual(infos[0][1], infos[1][1]);
    assert.strictEqual(infos[0][1].isConstructCall, false);
    assert.strictEqual(infos[0][1].name, 'obj.method');
    assert.strictEqual(infos[0][1].localName, 'obj.method');
    assert.strictEqual(infos[0][1].thisArg, obj);
    assert.strictEqual(infos[0][1].depth, 0);
    assert.strictEqual(infos[0][1].callID, 0);
    assert.strictEqual(infos[0][1].ret, 62);
    assert.strictEqual(infos[0][1].exception, undefined);
  });
});
