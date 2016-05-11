#!/usr/bin/env node
'use strict';

const argv = require('yargs')
  .usage('Usage: $0 ... program args')
  .demand(1)
  .alias('b', 'bindings').alias('b', 'binding')
  .describe('b', 'Trace native bindings')
  .alias('m', 'modules').alias('m', 'module')
  .describe('m', 'Trace builtin modules')
  .alias('g', 'globals').alias('g', 'global')
  .describe('g', 'Trace globals (Buffer, process)')
  .alias('a', 'arguments').alias('a', 'argument')
  .describe('a', 'Trace arguments to traced functions')
  .alias('r', 'returned').alias('r', 'ret')
  .describe('r', 'Trace return values of traced functions')
  .alias('color', 'colour').alias('color', 'colors').alias('color', 'colours')
  .describe('color', 'Toggle color output (always/never/auto)')
  .describe('r', 'Trace return values of traced functions')
  .describe('z', 'Provide the __ztrace__ global')
  .describe('e', 'An expression for selective hooking')
  .describe('p', 'An expression for selective printing')
  .example('$0 -- npm --version')
  .argv;

const Module = require('module');
const which = require('which');
const arrify = require('arrify');
const chalk = require('chalk');
const regexify = require('../lib/regexify.js');

if (argv.color !== undefined && argv.color !== 'auto') {
  chalk.enabled = !['never', 'no'].includes(argv.color);
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

const hookExpressions = arrify(argv.e).map(e => regexify(e));
const printExpressions = arrify(argv.p).map(e => regexify(e));

const options = {
  trace,
  provideGlobal: argv.z,
  hookExpressions: hookExpressions,
  printExpressions: printExpressions,
};

if (argv.startupWarnings !== undefined)
  options.suppressStartupWarnings = !argv.startupWarnings;

new ZTraceCLI().init(options);

process.argv = [process.argv[0]].concat(argv._);
Module.runMain(); // inspects process.argv[1]