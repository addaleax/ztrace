'use strict';

const vm = require('vm');

const BuiltinNames = (() => {
  const context = vm.createContext();
  context.global = context;
  return vm.runInContext('Object.getOwnPropertyNames(global)', context);
})();

const ExcludeBuiltins = [ 'Proxy', 'Reflect', 'global' ];
const AddPrimitives = [ 'Buffer' ];

const PrimitiveNames =
    BuiltinNames.filter(n => !ExcludeBuiltins.includes(n))
                .concat(AddPrimitives);
const Primitives = [...new Set(PrimitiveNames.map(name => global[name]))];

for (let i = 0; i < Primitives.length; ++i) {
  const p = Primitives[i];
  if (!p)
    continue;

  const additionals = [ p.prototype, Object.getPrototypeOf(p) ];

  for (let a of additionals)
    if (!Primitives.includes(a))
      Primitives.push(a);
}

const PrimitiveFunctions = Primitives.filter(p => typeof p === 'function');
const PrimitiveConstructors = PrimitiveFunctions.filter(p => p !== Object && p !== Array);
const PrimitiveObjects = Primitives.filter(p => typeof p === 'object');

function isPrimitive(v) {
  switch (typeof v) {
    case 'function':
      return PrimitiveFunctions.some(p => v === p);
      break;
    case 'object':
      if (v === null || PrimitiveObjects.includes(v))
        return true;

      for (const c of PrimitiveConstructors) {
        try {
           if (v instanceof p)
            return true;
        } catch(e) {}
      }

      return false;
    default:
      return true;
  }
}

module.exports = isPrimitive;
