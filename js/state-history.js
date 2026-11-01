(function (global) {
  'use strict';

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createHistory({ initialObjects = [], maxEntries = 100 } = {}) {
    let history = [deepClone(initialObjects)];
    let redoStack = [];

    return {
      commit(objects) {
        history.push(deepClone(objects));
        if (history.length > maxEntries) history.shift();
        redoStack = [];
      },

      undo() {
        if (history.length <= 1) return null;
        redoStack.push(history.pop());
        return deepClone(history[history.length - 1]);
      },

      redo() {
        if (!redoStack.length) return null;
        const state = redoStack.pop();
        history.push(deepClone(state));
        return deepClone(state);
      },

      reset(objects) {
        history = [deepClone(objects)];
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
