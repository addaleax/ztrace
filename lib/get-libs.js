'use strict';

function getLibs() {
  const natives = process.binding('natives');

  const libs = Object.keys(natives);
  const bindings = libs.map(lib => {
    const source = natives[lib];
    const re = /process\s*\.\s*binding\s*\(([^)]+)\)/g;
    const matches = [];

    let match;
    while (match = re.exec(source)) {
      matches.push(eval(match[1]));
    }

    return matches;
  }).reduce((a, b) => a.concat(b)).sort().reduce(uniqReduce);

  bindings.push('natives');
  const nonDeprecatedLibs = libs.filter(notIncludedIn(['_linklist', 'sys']));

  const ret = {
    modules: zip(nonDeprecatedLibs, nonDeprecatedLibs.map(tryInvoke(require))),
    bindings: zip(bindings, bindings.map(tryInvoke(process.binding)))
  };

  return ret;
}

function uniqReduce(prev, cur, index) {
  if (index === 1) {
    prev = [prev];
  }

  if (!prev.includes(cur)) {
    prev.push(cur);
  }

  return prev;
}

function notIncludedIn(array) {
  return (value) => {
    return array.indexOf(value) === -1;
  };
}

function tryInvoke(fn) {
  return (value) => {
    try {
      return fn(value);
    } catch (err) {
      return null;
    }
  };
}

function zip(arr1, arr2) {
  const zipped = Object.create(null);

  arr1.forEach((key, index) => {
    const value = arr2[index];
    if (value)
      zipped[key] = value;
  });

  return zipped;
}

module.exports = getLibs;
