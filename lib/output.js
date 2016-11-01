'use strict';
const { writeSync } = require('fs');

const output = {
  fd: 2,
  write(chunk) {
    writeSync(output.fd, chunk);
  }
};

module.exports = output;
