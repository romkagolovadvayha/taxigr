// Run in BOTH the window and the worker: Metro's polyfills do not reach these
// separately served bundles. Transpiling syntax alone does not add built-ins.
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true, writable: true,
    value: function hasOwn(object, property) {
      return Object.prototype.hasOwnProperty.call(object, property);
    },
  });
}

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true, writable: true,
    value: function at(index) {
      'use strict';
      if (this == null) throw new TypeError('Array.at called on null or undefined');
      const object = Object(this);
      const length = Math.min(Math.max(Math.trunc(Number(object.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
      const offset = Math.trunc(Number(index)) || 0;
      const position = offset < 0 ? length + offset : offset;
      return position < 0 || position >= length ? undefined : object[position];
    },
  });
}
