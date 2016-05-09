'use strict';

exports.trace = function trace(depth) {
  const origLimit = Error.stackTraceLimit;
  const origPrepare = Error.prepareStackTrace;
  if (depth) Error.stackTraceLimit = depth;
  Error.prepareStackTrace = (_, stack) => stack;
  const stack = new Error().stack;
  Error.prepareStackTrace = origPrepare;
  Error.stackTraceLimit = origLimit;
  return stack;
};

const mappings = {
  'column': 'getColumnNumber',
  'evalOrigin': 'getEvalOrigin',
  'file': 'getEvalOrigin',
  'function': 'getFunction',
  'functionName': 'getFunctionName',
  'line': 'getLineNumber',
  'methodName': 'getMethodName',
  'position': 'getPosition',
  'script': 'getScriptNameOrSourceURL',
  'this': 'getThis',
  'type': 'getTypeName'
};

const CallSite = exports.trace(1)[0].constructor;

for (let key in mappings) {
  const realFn = mappings[key];
  Object.defineProperty(CallSite.prototype, key, {
    get() {
      return this[realFn]();
    }
  });
}

CallSite.prototype.inspect = function() {
  return {
    column: this.column,
    line: this.line,
    file: this.file,
    functionName: this.functionName
  };
};

CallSite.prototype.toJSON = function() {
  return Object.assign.apply(null, Object.keys(mappings).map(key => ({
    [key]: this[key]
  })));
};
