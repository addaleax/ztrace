'use strict';
const fs = require('fs');
const assert = require('assert');

fs.readFile(__filename, (err, data) => {
  assert.ifError(err);
  fs.writeFile(__filename, data, assert.ifError);
});
