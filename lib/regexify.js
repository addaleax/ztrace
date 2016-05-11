'use strict';

function generateRE(expression) {
  const wrappedRE = /^\/(.+)\/$/;
  const match = expression.match(wrappedRE);
  if (match) {
    return match[1];
  }

  expression = expression.replace(/\[(.+)\]/g, '.$1');
  const components = expression.split('.').map(component => {
    if (component === '*') {
      return '(?:[^.]*)';
    } else if (component === '**') {
      return '(?:.*)';
    } else {
      return component;
    }
  });

  const re = components.join('(?:|\\.') + ')'.repeat(components.length - 1);
  return `^@?${re}$`;
}

function regexify(expression) {
  const re = new RegExp(generateRE(expression));
  return re.test.bind(re);
}

module.exports = regexify;
