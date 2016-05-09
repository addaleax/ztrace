'use strict';

const util = require('util');

function formatArgs(args) {
  const formatted = args.map(value => {
    if (typeof value === 'object' && value && value.constructor && value.constructor.name) {
      return safejoin `${value.constructor.name} {}`;
    } else if (typeof value === 'function' && value.name) {
      return safejoin `[Function ${value.name}]`;
    }

    const inspected = util.inspect(value, { depth: 0 }).replace(/\s+/g, ' ');
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
