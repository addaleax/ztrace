'use strict';
const ztrace = require('../../');
const fs = require('fs');

ztrace(fs).statSync('.');
