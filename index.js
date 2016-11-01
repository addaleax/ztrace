'use strict';
const { ZTrace, ZTraceGlobal } = require('./lib/ztrace.js');
const { ZTraceWriter } = require('./lib/writer.js');
const output = require('./lib/output.js');

function TraceSingleObject(object, options = {}) {
  options = Object.assign({
    output
  }, options);

  return new ZTraceWriter()
    .init(options, new ZTrace())
    .hookValue(options.name || '~', object, {
      type: 'custom',
      existingObject: false
    });
}

module.exports = Object.assign(TraceSingleObject, {
  ZTrace, ZTraceGlobal, ZTraceWriter
});
