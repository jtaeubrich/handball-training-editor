// Instrument real drawing contexts so command comparisons also exercise Chromium.
function installRenderCapture() {
  const sources = new WeakMap();
  window.Path2D = new Proxy(window.Path2D, {
    construct(Target, args) {
      const path = new Target(...args);
      sources.set(path, args[0]);
      return path;
    }
  });
  window.__pathSources = sources;
  window.__renderers = {};
  for (const [globalName, factory, key] of [
    ['HandballCanvasRenderer', 'createCanvasRenderer', 'canvas'],
    ['HandballSvgRenderer', 'createSvgRenderer', 'svg']
  ]) {
    Object.defineProperty(window, globalName, {
      configurable: true,
      set(module) {
        const create = module[factory];
        module[factory] = (...args) => {
          const renderer = create(...args);
          window.__renderers[key] = renderer;
          return renderer;
        };
        Object.defineProperty(window, globalName, { value: module, configurable: true });
      }
    });
  }
}

function measureObject(object) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 500;
  const real = canvas.getContext('2d');
  const commands = [];
  const normalize = value => {
    if (typeof value === 'number') return Math.round(value * 1e8) / 1e8;
    if (value instanceof Path2D) return { path: window.__pathSources.get(value) };
    if (Array.isArray(value)) return value.map(normalize);
    return value;
  };
  const context = new Proxy(real, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== 'function') return value;
      return (...args) => {
        commands.push([key, ...args.map(normalize)]);
        return value.apply(target, args);
      };
    },
    set(target, key, value) {
      commands.push(['set', key, normalize(value)]);
      target[key] = value;
      return true;
    }
  });
  window.__renderers.canvas.drawObject(context, structuredClone(object), false);
  const svg = window.__renderers.svg.objectToSvg(structuredClone(object), 7);
  return { commands, svg };
}

// Floating point trig implementations can differ in their last few digits by OS.
function normalizeSvg(svg) {
  return svg
    .replace(/\n[ \t]*/g, '\n') // module indentation is not SVG content
    .replace(/-?\d+\.\d+(?:e[+-]?\d+)?/gi, value => String(Math.round(Number(value) * 1e8) / 1e8));
}

module.exports = { installRenderCapture, measureObject, normalizeSvg };
