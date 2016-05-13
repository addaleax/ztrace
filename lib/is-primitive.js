'use strict';

const Primitives = [
  Array,
  ArrayBuffer,
  Boolean,
  Buffer,
  DataView,
  Date,
  Error,
  EvalError,
  Float32Array,
  Float64Array,
  Function,
  Int16Array,
  Int32Array,
  Int8Array,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  RangeError,
  ReferenceError,
  RegExp,
  Set,
  String,
  Symbol,
  SyntaxError,
  TypeError,
  URIError,
  Uint16Array,
  Uint32Array,
  Uint8Array,
  Uint8ClampedArray,
  WeakMap,
  WeakSet,
  decodeURI,
  decodeURIComponent,
  encodeURI,
  encodeURIComponent,
  escape,
  eval,
  isFinite,
  isNaN,
  parseFloat,
  parseInt,
  unescape
];

for (let i = 0; i < Primitives.length; ++i) {
  const p = Primitives[i];
  if (!p)
    continue;

  const additionals = [ p.prototype, Object.getPrototypeOf(p) ];

  for (let a of additionals)
    if (!Primitives.includes(a))
      Primitives.push(a);
}

const PrimitiveFunctions = Primitives.filter(p => typeof p === 'function');
const PrimitiveConstructors = PrimitiveFunctions.filter(p => p !== Object);
const PrimitiveObjects = Primitives.filter(p => typeof p === 'object');

function isPrimitive(v) {
  switch (typeof v) {
    case 'function':
      return PrimitiveFunctions.some(p => v === p);
      break;
    case 'object':
      return v === null || PrimitiveObjects.includes(v) ||
             PrimitiveConstructors.some(p => v instanceof p);
    default:
      return true;
  }
}

module.exports = isPrimitive;
