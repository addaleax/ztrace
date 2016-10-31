'use strict';

const ZTrace = require('./ztrace.js');
const formatArgs = require('./formatting.js').formatArgs;
const chalk = require('chalk');

function expressionTest(expressions) {
  if (!expressions || !expressions.length)
    return Object.assign(() => true, { disabled: true });

  return thingy => expressions.some(e => e(thingy));
}

class ZTraceShim {
  constructor() {
    this.ztrace = null;
    this.lastCallID = null;
    this.pendingNewline = false;
    this.printDepth = 0;
  }

  log(...args) {
    const stringified = [...args].join(' ');
    this.ztrace.runUntraced(() => {
      this.output.write(stringified);
    });
  }

  init(options) {
    process.on('exit', () => {
      if (this.pendingNewline) this.log('\n');
    });

    this.hookCheck = expressionTest(options.hookExpressions);
    this.printCheck = expressionTest(options.printExpressions);
    this.stackCheck = expressionTest(options.stackExpressions);

    this.output = options.output;

    if (!this.hookCheck.disabled) {
      options.filter = ({name}) => {
        return this.hookCheck(name);
      };
    }

    if (!this.stackCheck.disabled) {
      options.gatherCallSites = true;
    }

    this.objectDisplayLength = options.objectDisplayLength || undefined;

    this.ztrace = new ZTrace(options);
    this.ztrace.setupHooks()
      .on('enter', info => this.enter(info))
      .on('leave', info => this.leave(info));

    if (options.provideGlobal) {
      global.__ztrace__ = this.ztrace;
    }
  }

  enter(info) {
    if (!this.printCheck(info.localName)) return;

    this.lastCallID = info.callID;
    const pad = ' '.repeat(this.printDepth++);
    if (this.pendingNewline) this.log(`\n`)
    const callinfo = chalk[{
      passed: 'cyan',
      global: 'red',
      module: 'green',
      binding: 'yellow',
      ret: 'magenta'
    }[info.context.type]](`${info.localName}`);
    this.log(`${pad}${callinfo}(${formatArgs(info.argumentsList,true,this.objectDisplayLength)})`);
    this.pendingNewline = true;

    if (!this.stackCheck.disabled && this.stackCheck(info.localName)) {
      this.pendingNewline = false;
      this.log(`\n${info.stack.join('\n')}\n`);
    }
  }

  leave(info) {
    if (!this.printCheck(info.localName)) return;

    const pad = ' '.repeat(--this.printDepth);
    const returnedRaw = `${formatArgs([info.ret],true,this.objectDisplayLength)}`;
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
