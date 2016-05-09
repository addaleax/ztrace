'use strict';

const getLibs = require('./get-libs.js');
const formatting = require('./formatting.js');
const isPrimitive = require('./is-primitive.js');
const stackSupport = require('./stack-support.js');

const formatArgs = formatting.formatArgs;
const safejoin = formatting.safejoin;

const Object = global.Object;

class ZTrace {
  constructor(options) {
    this.kIsHooked = Symbol('kIsHooked');
    this.kCachedProxy = Symbol('kCachedProxy');
    this.kUnwrappedFunction = Symbol('kUnwrappedFunction');
    this.kKnownAs = Symbol('kKnownAs');
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
      }
    }, options, {
      trace: Object.assign({
        binding: false,
        module: true,
        global: true,
        passed: true,
        ret: true
      }, options.trace)
    });
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
      fn();
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

    if (this.options.trace.binding) {
      for (let lib in libs.bindings) {
        this.hookValue(`@${lib}`, libs.bindings[lib], { type: 'binding' });
      }
    }

    if (this.options.trace.global) {
      for (let key in global) {
        if (key === 'global')
          continue;

        this.hookValue(key, global[key], { type: 'global' });
      }
    }

    if (this.options.trace.module) {
      for (let lib in libs.modules) {
        this.hookValue(lib, libs.modules[lib], { type: 'module' });
      }
    }

    return this.emitter;
  }

  isHookedObject(object) {
    return object[this.kIsHooked];
  }

  hookObject(moduleName, object, context) {
    if (object[this.kIsHooked]) {
      return;
    }

    const specialProperties = Object.create(null);
    if (Object.isExtensible(object)) {
      object[this.kKnownAs] = moduleName;
      object[this.kIsHooked] = true;
      object[this.kSpecialProperties] = specialProperties;
    }

    const ztrace = this;

    const properties = Object.getOwnPropertyNames(object);

    for (let property of properties) {
      const name = safejoin `${moduleName}.${property}`;

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
    if (isPrimitive(value) || this.inUntracedMode > 0) {
      return value;
    }

    if (this.isHookedObject(value) || !this.filter({name, value})) {
      return value;
    }

    this.hookObject(name, value, context);

    if (typeof value === 'object') {
      return value;
    }

    if (value[this.kCachedProxy]) {
      return value[this.kCachedProxy];
    }

    name = value[this.kKnownAs] || name;

    const wrapCall = (prefix, target, thisArg, argumentsList, fn) => {
      if (this.options.trace.passed) {
        argumentsList = this.hookValue(safejoin `(${prefix}${name} args)`,
                                       argumentsList,
                                       Object.assign({}, context, {
                                         type: 'passed'
                                       }));
      }

      const callID = this.callID++;
      this.currentNesting++;
      let ret, exception;

      try {
        const depth = this.currentNesting - 1;
        const info = {
          prefix, name, thisArg, argumentsList, depth, callID, context
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
          ret = this.hookValue(`${prefix}${name}()`,
                               ret,
                               Object.assign({}, context, { type: 'ret' }));
        }
      } finally {
        this.currentNesting--;
      }

      if (exception) throw exception;
      return ret;
    }

    value[this.kCachedProxy] = new Proxy(value, {
      apply(target, thisArg, argumentsList) {
        return wrapCall('', target, thisArg, argumentsList,
            argumentsList_ => target.apply(thisArg, argumentsList_));
      },
      construct(target, argumentsList, newTarget) {
        return wrapCall('new ', target, null, argumentsList,
            argumentsList_ => new target(...argumentsList_));
      }
    });

    value[this.kCachedProxy][this.kUnwrappedFunction] = value;

    return value[this.kCachedProxy];
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
