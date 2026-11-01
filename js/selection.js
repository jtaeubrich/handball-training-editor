(function (global) {
  'use strict';

  function clear(indices) {
    indices.clear();
    return -1;
  }

  function setSingle(indices, index) {
    indices.clear();
    if (index >= 0) indices.add(index);
    return index >= 0 ? index : -1;
  }

  function toggle(indices, selected, index) {
    if (index < 0) return selected;

    if (indices.has(index)) {
      indices.delete(index);
      if (selected === index) {
        return indices.size ? Array.from(indices).at(-1) : -1;
      }
      return selected;
    }

    indices.add(index);
    return index;
  }

  function selectedObjects(indices, objects) {
    return Array.from(indices)
      .filter(i => i >= 0 && i < objects.length)
      .map(i => objects[i]);
  }

  function duplicateSelected(indices, objects, clone) {
    const source = Array.from(indices)
      .filter(i => i >= 0 && i < objects.length)
      .sort((a,b) => a-b);

    if (!source.length) return { selected: -1, newIndices: [] };

    const newIndices = [];
    source.forEach(i => {
      objects.push(clone(objects[i]));
      newIndices.push(objects.length - 1);
    });

    indices.clear();
    newIndices.forEach(i => indices.add(i));

    return {
      selected: newIndices[newIndices.length - 1],
      newIndices
    };
  }

  function applyRectangle(indices, hits, additive) {
    if (!additive) indices.clear();
    hits.forEach(i => indices.add(i));
    return indices.size ? Array.from(indices).at(-1) : -1;
  }

  function count(indices) {
    return indices.size;
  }

  global.HandballSelection = {
    clear,
    setSingle,
    toggle,
    selectedObjects,
    duplicateSelected,
    applyRectangle,
    count
  };
})(window);
