'use strict';

const util = require('util');
const isPrimitive = require('./is-primitive.js');

function formatArgs(args, pretty) {
  const formatted = args.map(value => {
    if (typeof value === 'object' && value && value.constructor && value.constructor.name && (!pretty || !isPrimitive(value.constructor))) {
      return safejoin `${value.constructor.name} {}`;
    } else if (typeof value === 'function' && value.name) {
      return safejoin `[Function ${value.name}]`;
    }

    const inspected = util.inspect(value, { depth: pretty ? 1 : 0 }).replace(/\s+/g, ' ');
    return inspected.length <= 37 ? inspected :
        `${inspected.slice(0, 30)}...${inspected.slice(-7)}`;
  });
  return formatted.join(', ')
}

function safejoin(arr, val1, ...args) {
  if (arr.length <= 1) {
    return arr[0];
  }

  let v1s = '<String() failed>';
  try {
    v1s = String(val1);
  } catch (e) {}

  return arr[0] + v1s + safejoin(arr.slice(1), ...args);
}

exports.formatArgs = formatArgs;
exports.safejoin = safejoin;
