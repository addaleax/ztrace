#!/usr/bin/env node
'use strict';

const argv = require('yargs')
  .usage('Usage: $0 ... program args')
  .demand(1)
  .boolean('b').default('b', undefined)
  .alias('b', 'bindings').alias('b', 'binding')
  .describe('b', 'Trace native bindings')
  .boolean('m').default('m', undefined)
  .alias('m', 'modules').alias('m', 'module')
  .describe('m', 'Trace builtin modules')
  .boolean('g').default('g', undefined)
  .alias('g', 'globals').alias('g', 'global')
  .describe('g', 'Trace globals (Buffer, process)')
  .boolean('a').default('a', undefined)
  .alias('a', 'arguments').alias('a', 'argument')
  .describe('a', 'Trace arguments to traced functions')
  .boolean('r').default('r', undefined)
  .alias('r', 'returned').alias('r', 'ret')
  .describe('r', 'Trace return values of traced functions')
  .boolean('l').default('l', undefined)
  .alias('l', 'loading')
  .describe('l', 'Trace module loading internals')
  .alias('color', 'colour').alias('color', 'colors').alias('color', 'colours')
  .describe('color', 'Toggle color output (always/never/auto)')
  .boolean('z').describe('z', 'Provide the __ztrace__ global')
  .describe('e', 'An expression for selective hooking')
  .describe('p', 'An expression for selective printing')
  .describe('S', 'An expression for selective stack trace printing')
  .example('$0 -- npm --version')
  .argv;

const fs = require('fs');
const Module = require('module');
const which = require('which');
const arrify = require('arrify');
const chalk = require('chalk');
const regexify = require('../lib/regexify.js');

const outputFD = 2;
const output = {
  write(chunk) {
    fs.writeSync(outputFD, chunk);
  }
};

if (argv.color !== undefined && argv.color !== 'auto') {
  chalk.enabled = !['never', 'no'].includes(argv.color);
} else {
  chalk.enabled = require('tty').isatty(outputFD)
}

try {
  argv._[0] = which.sync(argv._[0]);
} catch(e) {}

const ZTraceCLI = require('../lib/shim.js');
const trace = {};

if (argv.b !== undefined) trace.binding = !!argv.b;
if (argv.m !== undefined) trace.module = !!argv.m;
if (argv.g !== undefined) trace.global = !!argv.g;
if (argv.a !== undefined) trace.passed = !!argv.a;
if (argv.r !== undefined) trace.ret = !!argv.r;
if (argv.l !== undefined) trace.moduleLoading = !!argv.l;

const hookExpressions = arrify(argv.e).map(e => regexify(e));
const printExpressions = arrify(argv.p).map(e => regexify(e));
const stackExpressions = arrify(argv.S).map(e => regexify(e));

const options = {
  trace,
  provideGlobal: argv.z,
  hookExpressions,
  printExpressions,
  stackExpressions,
  output
};

if (argv.startupWarnings !== undefined)
  options.suppressStartupWarnings = !argv.startupWarnings;

new ZTraceCLI().init(options);

process.argv = [process.argv[0]].concat(argv._);
Module.runMain(); // inspects process.argv[1]
