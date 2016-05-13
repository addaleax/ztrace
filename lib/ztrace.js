'use strict';

const getLibs = require('./get-libs.js');
const formatting = require('./formatting.js');
const isPrimitive = require('./is-primitive.js');
const stackSupport = require('./stack-support.js');

const safejoin = formatting.safejoin;

/*const fsWriteSync = process.binding('fs').writeString
const safelog = (...args) => {
  fsWriteSync(2, formatting.formatArgs(args, true))
  fsWriteSync(2, '\n')
}*/

const Object = global.Object;

class ZTrace {
  constructor(options) {
    this.kIsHooked = Symbol('kIsHooked');
    this.kIsProxyHooked = Symbol('kIsProxyHooked');
    this.kCachedProxy = Symbol('kCachedProxy');
    this.kUnwrappedFunction = Symbol('kUnwrappedFunction');
    this.kKnownAs = Symbol('kKnownAs');
    this.kNameOverride = Symbol('kNameOverride');
    this.kSpecialProperties = Symbol('kSpecialProperties');
    this.kDescriptorSourceObject = Symbol('kDescriptorSourceObject');
    this.kGlobalObjectHooksInPlace = Symbol('kGlobalObjectHooksInPlace');

    this.currentNesting = 0;
    this.inTraceEvent = 0;
    this.callID = 0;
    this.emitter = null;

    this.inUntracedMode = 0;

    options = options || {};

    this.options = Object.assign({
      gatherCallSites: false,
      filter({name}) {
        return name !== 'process.EventEmitter';
      },
      suppressStartupWarnings: true
    }, options, {
      trace: Object.assign({
        binding: true,
        module: true,
        global: true,
        passed: true,
        ret: true
      }, options.trace)
    });

    const oldFormatArgs = formatting.formatArgs;
    formatting.formatArgs = (...args) => this.runUntraced(() => oldFormatArgs(...args));
  }

  getNiceStack() {
    const depth = typeof this.options.gatherCallSites === 'number' ?
        this.options.gatherCallSites : 40;

    const stack_ = stackSupport.trace(depth);
    let i;
    for (i = 1; i < stack_.length; i++) {
      if (stack_[i].getFileName() !== stack_[1].getFileName()) {
        break;
      }
    }

    const stack = stack_.slice(i);
    stack.realStack = stack_;
    return stack;
  }

  filter(info) {
    if (this.options.gatherCallSites) {
      info.stack = this.getNiceStack();
    }

    return this.options.filter(info);
  }

  runUntraced(fn) {
    this.inUntracedMode++;
    try {
      return fn();
    } finally {
      this.inUntracedMode--;
    }
  }

  hookPropertyDescriptorAccessors() {
    if (Object[this.kGlobalObjectHooksInPlace]) {
      return;
    }

    Object[this.kGlobalObjectHooksInPlace] = true;
    // Hook up the ways for setting property descriptors so that some ways
    // of cloning objects work reliably.
    const ztrace = this;
    const realGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const realDefineProperty = Object.defineProperty;
    const realCreate = Object.create;

    Object.getOwnPropertyDescriptor = (obj, name) => {
      const realResult = realGetOwnPropertyDescriptor(obj, name);
      if (realResult && obj) {
        realResult[ztrace.kDescriptorSourceObject] = obj;
      }
      return realResult;
    };

    Object.defineProperty = (obj, name, descriptor) => {
      const sourceObject = descriptor[ztrace.kDescriptorSourceObject];

      if (sourceObject) {
        const specialProperties = sourceObject[ztrace.kSpecialProperties];
        if (specialProperties) {
          const specialProperty = specialProperties[name];
          if (specialProperty) {
            const { sValue } = specialProperty;
            obj[sValue] = sourceObject[sValue];
          }
        }
      }

      return realDefineProperty(obj, name, descriptor);
    };

    Object.create = (proto, properties) => {
      const obj = realCreate(proto);
      for (let k in properties) {
        Object.defineProperty(obj, k, properties[k]);
      }
      return obj;
    };
  }

  setupHooks() {
    const libs = getLibs();
    const EventEmitter = libs.modules.events;
    this.emitter = new EventEmitter();

    this.hookPropertyDescriptorAccessors();

    const oldEmitWarning = process.emitWarning;

    if (this.options.suppressStartupWarnings) {
      process.emitWarning = () => {};
    }

    if (this.options.trace.binding) {
      for (let lib in libs.bindings) {
        this.hookValue(`@${lib}`, libs.bindings[lib], {
          type: 'binding', existingObject: true
        })[this.kNameOverride] = `@${lib}`;
      }
    }

    if (this.options.trace.global) {
      for (let key in global) {
        if (key === 'global')
          continue;

        this.hookValue(key, global[key], {
          type: 'global', existingObject: true
        })[this.kNameOverride] = key;
      }
    }

    if (this.options.trace.module) {
      for (let lib in libs.modules) {
        this.hookValue(lib, libs.modules[lib], {
          type: 'module', existingObject: true
        })[this.kNameOverride] = lib;
      }
    }

    if (this.options.suppressStartupWarnings) {
      process.emitWarning = oldEmitWarning;
    }

    return this.emitter;
  }

  isHookedObject(object) {
    return Object.prototype.hasOwnProperty.call(object, this.kIsHooked);
  }

  hookObject(objectName, object, context) {
    if (this.isHookedObject(object)) {
      return;
    }

    const specialProperties = Object.create(null);
    if (Object.isExtensible(object)) {
      object[this.kSpecialProperties] = specialProperties;
      object[this.kIsHooked] = true;
    }

    const ztrace = this;

    const properties = Object.getOwnPropertyNames(object);

    for (let property of properties) {
      const name = safejoin `${objectName}.${property}`;

      if (!this.filter({name, property, object})) {
        continue;
      }

      const sValue = Symbol(`${name}:[[Value]]`);
      specialProperties[property] = { sValue };

      const descriptor = Object.getOwnPropertyDescriptor(object, property);

      if (!descriptor.configurable) {
        let value;

        try {
          value = object[property];
        } catch(e) {}
        this.hookValue(name, value, context);
        continue;
      }

      if ('value' in descriptor && isPrimitive(descriptor.value)) {
        continue;
      }

      object[sValue] = descriptor.value;
      Object.defineProperty(object, property, {
        enumerable: descriptor.enumerable,
        configurable: true,
        get() {
          if (descriptor.get) {
            const oldValue = this[sValue];
            this[sValue] = descriptor.get.call(this);
          }

          return ztrace.hookValue(name, this[sValue], context);
        },
        set(value) {
          this[sValue] = value;
          if (descriptor.set) {
            descriptor.set.call(this, value);
            return true;
          }
        }
      });
    }
  }

  hookValue(name, value, context) {
    if (isPrimitive(value) || this.inUntracedMode > 0 || value === this) {
      return value;
    }

    name = value[this.kNameOverride] || name;

    if (this.isHookedObject(value)) {
      if (typeof value !== 'function')
        return value;

      if (value[this.kIsProxyHooked] && value[this.kKnownAs] === name)
        return value;
    }

    // Call the user-provided filter last, always.
    if (!this.filter({name, value})) {
      return value;
    }

    if (context.existingObject) {
      this.hookObject(name, value, context);

      if (typeof value === 'object')
        return value;
    }

    if (value[this.kCachedProxy]) {
      const p = value[this.kCachedProxy];

      if (p[this.kKnownAs] === name) {
        return p;
      }

      value = p[this.kUnwrappedFunction];
    }

    value[this.kIsHooked] = true;

    const wrapCall = (isConstructCall, target, thisArg, argumentsList, fn) => {
      let localName = name;
      if (isConstructCall) {
        if (localName.includes('('))
          localName = `(${localName})`;

        localName = `new ${localName}`;
      }

      if (this.options.trace.passed) {
        argumentsList = this.hookValue(safejoin `(${localName} args)`,
                                       argumentsList,
                                       Object.assign({}, context, {
                                         type: 'passed',
                                         existingObject: false
                                       }));
      }

      const callID = this.callID++;
      this.currentNesting++;
      let ret, exception;

      try {
        const depth = this.currentNesting - 1;
        const info = {
          isConstructCall, name, thisArg, argumentsList,
          depth, callID, context, localName
        };

        if (this.options.gatherCallSites) {
          info.stack = this.getNiceStack();
        }

        this.emitEvent('enter', info);

        try {
          ret = fn(argumentsList);
        } catch (err) {
          exception = err;
        }

        Object.assign(info, { ret, exception });
        this.emitEvent('leave', info);

        if (this.options.trace.ret) {
          ret = this.hookValue(`${localName}()`,
                               ret,
                               Object.assign({}, context, {
                                 type: 'ret',
                                 existingObject: false
                                }));
        }
      } finally {
        this.currentNesting--;
      }

      if (exception) throw exception;
      return ret;
    }

    const ztrace = this;

    const proxy = new Proxy(value, {
      apply(target, thisArg, argumentsList) {
        return wrapCall(false, target, thisArg, argumentsList,
            argumentsList_ => target.apply(thisArg, argumentsList_));
      },
      construct(target, argumentsList, newTarget) {
        return wrapCall(true, target, null, argumentsList,
            argumentsList_ => new target(...argumentsList_));
      },
      get(target, property, receiver) {
        if (property === ztrace.kUnwrappedFunction) {
          return target;
        } else if (property === ztrace.kIsProxyHooked) {
          return true;
        } else if (property === ztrace.kKnownAs) {
          return name;
        } else if (typeof property === 'symbol') {
          return target[property];
        } else {
          return ztrace.hookValue(safejoin `${name}.${property}`,
                                  target[property],
                                  Object.assign({}, context, {
                                    existingObject: false
                                  }));
        }
      }
    });

    if (Object.isExtensible(value)) {
      value[this.kCachedProxy] = proxy;
    }

    return proxy;
  }

  emitEvent(...args) {
    const level = this.inTraceEvent++;
    try {
      if (level === 0 && this.emitter !== null) {
        this.emitter.emit(...args);
      }
    } finally {
      this.inTraceEvent--;
    }
  }
}

module.exports = ZTrace;
