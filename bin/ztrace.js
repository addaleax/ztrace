#!/usr/bin/env node
'use strict';

const argv = require('yargs')
  .usage('Usage: $0 ... program args')
  .alias('b', 'bindings').count('b')
  .describe('b', 'Trace native bindings')
  .alias('m', 'modules').count('m')
  .describe('m', 'Trace builtin modules')
  .alias('g', 'globals').count('g')
  .describe('g', 'Trace globals (Buffer, process)')
  .alias('p', 'passed').count('p')
  .describe('g', 'Trace arguments to traced functions')
  .alias('r', 'returned').count('r')
  .describe('r', 'Trace return values of traced functions')
  .describe('z', 'Provide the __ztrace__ global')
  .describe('e', 'A regular expression for selective hooking. This is the fast one.')
  .describe('w', 'A regular expression for selective printing. This is the easy one.')
  .example('$0 -- npm --version')
  .argv;

const ZTraceCLI = require('../lib/shim.js');
const trace = {};

if (argv.b > 0) trace.binding = !!(argv.b % 2);
if (argv.m > 0) trace.module = !!(argv.m % 2);
if (argv.g > 0) trace.global = !!(argv.g % 2);
if (argv.p > 0) trace.passed = !!(argv.p % 2);
if (argv.r > 0) trace.ret = !!(argv.r % 2);

new ZTraceCLI().init({
  trace,
  provideGlobal: argv.z,
  hookExpression: argv.e ? new RegExp(argv.e) : undefined,
  printExpression: argv.w ? new RegExp(argv.w) : undefined
});

process.argv = [process.argv[0]].concat(argv._);
require(argv._[0]);
