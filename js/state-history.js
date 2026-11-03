(function (global) {
  'use strict';

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createHistory({ initialObjects = [], maxEntries = 100, captureMetadata, restoreMetadata } = {}) {
    const entry = objects => captureMetadata ? deepClone({objects,metadata:captureMetadata()}) : deepClone(objects);
    const unpack = state => {
      const copy = deepClone(state);
      if (captureMetadata) { restoreMetadata(copy.metadata); return copy.objects; }
      return copy;
    };
    let history = [entry(initialObjects)];
    let redoStack = [];

    return {
      commit(objects) {
        history.push(entry(objects));
        if (history.length > maxEntries) history.shift();
        redoStack = [];
      },

      undo() {
        if (history.length <= 1) return null;
        redoStack.push(history.pop());
        return unpack(history[history.length - 1]);
      },

      redo() {
        if (!redoStack.length) return null;
        const state = redoStack.pop();
        history.push(deepClone(state));
        return unpack(state);
      },

      reset(objects) {
        history = [entry(objects)];
        redoStack = [];
      },

      snapshot() {
        return {
          history: history.slice(),
          redoStack: redoStack.slice()
        };
      },

      restore(snapshot) {
        history = Array.isArray(snapshot?.history) ? snapshot.history.slice() : [[]];
        redoStack = Array.isArray(snapshot?.redoStack) ? snapshot.redoStack.slice() : [];
      },

      debugState() {
        return {
          historyLength: history.length,
          redoLength: redoStack.length
        };
      }
    };
  }

  global.HandballStateHistory = { createHistory };
})(window);
