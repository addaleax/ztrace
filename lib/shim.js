'use strict';

const ZTrace = require('./ztrace.js');
const formatArgs = require('./formatting.js').formatArgs;
const chalk = require('chalk');

class ZTraceShim {
  constructor() {
    this.ztrace = null;
    this.lastCallID = null;
    this.pendingNewline = false;
  }

  log(...args) {
    const output = [...args].join(' ');
    this.ztrace.runUntraced(() => {
      process.stderr.write(output);
    });
  }

  init(options) {
    process.on('exit', () => {
      if (this.pendingNewline) this.log('\n');
    });

    if (options.hookExpression) {
      options.filter = ({name}) => options.hookExpression.test(name);
    }

    this.ztrace = new ZTrace(options);
    this.ztrace.setupHooks()
      .on('enter', info => this.enter(info))
      .on('leave', info => this.leave(info));

    if (options.provideGlobal) {
      global.__ztrace__ = this.ztrace;
    }

    this.hookExpression = options.hookExpression;
    this.printExpression = options.printExpression;
  }

  enter(info) {
    if (this.printExpression && !this.printExpression.test(info.name)) {
      return;
    }

    this.lastCallID = info.callID;
    const pad = ' '.repeat(info.depth);
    if (this.pendingNewline) this.log(`\n`)
    const callinfo = chalk[{
      passed: 'cyan',
      global: 'red',
      module: 'green',
      binding: 'yellow',
      ret: 'magenta',
    }[info.context.type]](`${info.prefix}${info.name}`);
    this.log(`${pad}${callinfo}(${formatArgs(info.argumentsList)})`);
    this.pendingNewline = true;
  }

  leave(info) {
    if (this.printExpression && !this.printExpression.test(info.name)) {
      return;
    }

    const pad = ' '.repeat(info.depth);
    const returnedRaw = `${formatArgs([info.ret])}`;
    const returned = info.ret !== undefined ? returnedRaw : '';
    if (info.callID === this.lastCallID) {
      if (info.ret) this.log(` = ${returned}\n`);
      else this.log(`\n`)
      this.pendingNewline = false;
    } else {
      const out = `${pad}-> ${returnedRaw}\n`;
      if (this.pendingNewline) this.log(`\n${out}`);
      else this.log(out);
      this.pendingNewline = false;
    }
  }
}

module.exports = ZTraceShim;
