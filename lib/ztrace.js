'use strict';

const getLibs = require('./get-libs.js');
const formatting = require('./formatting.js');
const isPrimitive = require('./is-primitive.js');
const stackSupport = require('./stack-support.js');

const safejoin = formatting.safejoin;

const EventEmitter = require('events');

/*const fsWriteSync = process.binding('fs').writeString
const safelog = (s) => {
  fsWriteSync(2, s)
}*/

const Object = global.Object;

class ZTrace {
  constructor(options) {
    this.kIsHooked = Symbol('kIsHooked');
    this.kIsProxyHooked = Symbol('kIsProxyHooked');
    this.kCachedProxy = Symbol('kCachedProxy');
    this.kUnwrappedObject = Symbol('kUnwrappedObject');
    this.kKnownAs = Symbol('kKnownAs');
    this.kHookCreationContext = Symbol('kHookCreationContext');
    this.kNameOverride = Symbol('kNameOverride');
    this.kSpecialProperties = Symbol('kSpecialProperties');
    this.kDescriptorSourceObject = Symbol('kDescriptorSourceObject');
    this.kGlobalObjectHooksInPlace = Symbol('kGlobalObjectHooksInPlace');
    this.kNeverHook = Symbol('hNeverHook');

    this.currentNesting = 0;
    this.inTraceEvent = 0;
    this.callID = 0;
    this.emitter = null;

    this.inUntracedMode = 0;
    this.emitter = new EventEmitter();

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
        ret: true,
        moduleLoading: false
      }, options.trace)
    });

    // XXX Check whether this is actually necessary once there are proper tests in place.
    const oldFormatArgs = formatting.formatArgs;
    formatting.formatArgs = (...args) => this.runUntraced(() => oldFormatArgs(...args));

    // Hooking Node’s fatal exception handler gets nasty.
    process._fatalException[this.kNeverHook] = true;

    // Hooking coverage gathering objects is possible but pointless and slow.
    if (global.__coverage__) {
      global.__coverage__[this.kNeverHook] = true;
    }

    if (this.options.suppressStartupWarnings) {
      const realSetupHooks = this.setupHooks;
      this.setupHooks = (...args) => this.runWithoutProcessWarnings(() => realSetupHooks.call(this, ...args));
    }

    this.baseContext = {
      from: null,
      parentContext: null,
      existingObject: true,
      type: null
    };
  }

  getNiceStack() {
    const depth = typeof this.options.gatherCallSites === 'number' ?
        this.options.gatherCallSites : 40;

    const stack_ = stackSupport.trace(depth);
    const thisFileName = stack_[1].getFileName();

    let i;
    for (i = 1; i < stack_.length; i++)
      if (stack_[i].getFileName() !== thisFileName)
        break;

    const stack = stack_.slice(i).
        filter(frame => frame.getFileName() !== thisFileName);

    stack.realStack = stack_;
    return stack;
  }

  filter(info) {
    if (this.options.gatherCallSites) {
      info.stack = this.getNiceStack();
    }

    return this.options.filter(info);
  }

  runUntraced(fn, ...args) {
    this.inUntracedMode++;

    try {
      return fn.call(this, ...args);
    } finally {
      this.inUntracedMode--;
    }
  }

  runWithoutProcessWarnings(fn, ...args) {
    const oldEmitWarning = process.emitWarning;
    process.emitWarning = () => {};

    try {
      return fn.call(this, ...args);
    } finally {
      process.emitWarning = oldEmitWarning;
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
    this.hookPropertyDescriptorAccessors();
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
      object[this.kHookCreationContext] = context;
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
        this._hookValue(name, value, context);
        continue;
      }

      if ('value' in descriptor) {
        if (isPrimitive(descriptor.value) || descriptor.value[this.kNeverHook])
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

          return ztrace._hookValue(name, this[sValue], context);
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

  hookValue(name, object, context) {
    // `context` is optional.
    const ctx = Object.assign({}, this.baseContext, context);
    return this._hookValue(name, object, ctx);
  }

  _hookValue(name, value, context) {
    if (isPrimitive(value) || value === this) {
      return value;
    }

    if (this.inUntracedMode > 0 || value[this.kNeverHook]) {
      const unproxied = value[this.kUnwrappedObject];
      if (unproxied)
        return unproxied;
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

    if (context.existingObject || context.origin === 'binding') {
      this.hookObject(name, value, context);

      if (typeof value === 'object')
        return value;
    }

    if (value[this.kCachedProxy]) {
      const p = value[this.kCachedProxy];

      if (p[this.kKnownAs] === name) {
        return p;
      }

      value = p[this.kUnwrappedObject];
    }

    if (Object.isExtensible(value)) {
      value[this.kIsHooked] = true;
    }

    const wrapCall = (isConstructCall, target, thisArg, argumentsList, fn) => {
      let localName = name;
      if (isConstructCall) {
        if (localName.includes('('))
          localName = `(${localName})`;

        localName = `new ${localName}`;
      }

      if (this.options.trace.passed) {
        argumentsList = this._hookValue(safejoin `(${localName} args)`,
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
          let thisArg_ = thisArg;
          if (/\[native code\]/.test(Function.prototype.toString.call(target)) &&
              thisArg && thisArg[this.kIsProxyHooked]) {
            thisArg_ = thisArg[this.kUnwrappedObject];
          }
          ret = fn(thisArg_, argumentsList);
        } catch (err) {
          exception = err;
        }

        Object.assign(info, { ret, exception });
        this.emitEvent('leave', info);

        if (this.options.trace.ret) {
          ret = this._hookValue(`${localName}()`,
                               ret,
                               Object.assign({}, context, {
                                 type: 'ret',
                                 origin: context.origin || context.type,
                                 from: info,
                                 existingObject: false,
                                 parentContext: context
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
        const thisArgCtx = thisArg && thisArg[ztrace.kHookCreationContext];
        if (thisArgCtx && thisArgCtx.origin === 'binding') {
          thisArg = thisArg[ztrace.kUnwrappedObject];
        }

        return wrapCall(false, target, thisArg, argumentsList,
            (thisArg_, argumentsList_) => target.apply(thisArg_, argumentsList_));
      },
      construct(target, argumentsList, newTarget) {
        return wrapCall(true, target, null, argumentsList,
            (thisArg_, argumentsList_) =>
              Reflect.construct(target, argumentsList, newTarget));
      },
      get(target, property, receiver) {
        if (property === ztrace.kUnwrappedObject) {
          return target;
        } else if (property === ztrace.kIsProxyHooked) {
          return true;
        } else if (property === ztrace.kKnownAs) {
          return name;
        } else if (property === ztrace.kHookCreationContext) {
          return context;
        } else if (typeof property === 'symbol') {
          return target[property];
        } else {
          return ztrace._hookValue(safejoin `${name}.${property}`,
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

class ZTraceGlobal extends ZTrace {
  constructor(options) {
    super(options);
  }

  // Note: If `options.suppressStartupWarnings` is true, this function gets
  // wrapped using runWithoutProcessWarnings().
  setupHooks() {
    super.setupHooks();

    const libs = getLibs();
    const Module = libs.modules.module;

    if (this.options.trace.binding) {
      for (let lib in libs.bindings) {
        this.hookValue(`@${lib}`, libs.bindings[lib], {
          type: 'binding'
        })[this.kNameOverride] = `@${lib}`;
      }
    }

    if (this.options.trace.global) {
      for (let key in global) {
        if (key === 'global')
          continue;

        const newValue = this.hookValue(key, global[key], {
          type: 'global'
        }, this.baseContext);

        try {
          newValue[this.kNameOverride] = key;
          global[key] = newValue;
        } catch(e) {}
      }
    }

    if (this.options.trace.module) {
      for (let lib in libs.modules) {
        this.hookValue(lib, libs.modules[lib], {
          type: 'module'
        }, this.baseContext)[this.kNameOverride] = lib;
      }
    }

    if (!this.options.trace.moduleLoading) {
      const realLoad = Module._load;
      const run = fn => fn();

      Module._load = (request, parent, isMain) => {
        return (isMain ? run : this.runUntraced).call(this, () => {
          return realLoad(request, parent, isMain);
        });
      };
    }

    return this.emitter;
  }
}

module.exports = ZTraceGlobal;
module.exports.ZTraceGlobal = ZTraceGlobal;
module.exports.ZTrace = ZTrace;
