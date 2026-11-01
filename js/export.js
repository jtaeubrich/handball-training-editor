(function (global) {
  'use strict';

  function canvasToBlob(canvas, type = 'image/png') {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas konnte nicht als Datei exportiert werden.'));
      }, type);
    });
  }

  async function saveSvgText(svgText, fileName, saveBlob) {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    return saveBlob(blob, fileName);
  }

  async function saveCanvasPng(canvas, fileName, saveBlob) {
    const blob = await canvasToBlob(canvas, 'image/png');
    return saveBlob(blob, fileName);
  }

  global.HandballExport = {
    canvasToBlob,
    saveSvgText,
    saveCanvasPng
  };
})(window);
