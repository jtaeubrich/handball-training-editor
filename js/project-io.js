(function (global) {
  'use strict';

  function isStandaloneMode() {
    return !!(
      global.matchMedia?.('(display-mode: standalone)').matches ||
      global.navigator?.standalone === true
    );
  }

  function isIPadLike() {
    const nav = global.navigator || {};
    return /iPad/.test(nav.userAgent || '') ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function directDownloadBlob(blob, name) {
    const a = global.document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    global.document.body.appendChild(a);
    a.click();
    a.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function saveBlobForUser(blob, name, onStatus = () => {}) {
    if (isIPadLike() && !isStandaloneMode() && global.navigator?.share) {
      try {
        const ext = (name.split('.').pop() || '').toLowerCase();
        const isFileOnly = ext === 'svg' || ext === 'json';
        const file = new File([blob], name, {
          type: blob.type || 'application/octet-stream'
        });

        const shareData = {
          files: [file],
          title: isFileOnly ? `Datei speichern: ${name}` : name
        };

        if (!global.navigator.canShare || global.navigator.canShare(shareData)) {
          await global.navigator.share(shareData);
          onStatus(
            isFileOnly
              ? `${name}: „In Dateien sichern“ wählen`
              : `${name} zum Speichern bereit`
          );
          return { method: 'share', name };
        }
      } catch (err) {
        if (err && err.name === 'AbortError') {
          onStatus('Speichern abgebrochen');
          return { method: 'cancelled', name };
        }
        console.warn('iPad share/save failed, using download fallback.', err);
      }
    }

    directDownloadBlob(blob, name);
    return { method: 'download', name };
  }

  async function ensureFileHandlePermission(handle) {
    if (!handle) return false;
    try {
      if (!handle.queryPermission || !handle.requestPermission) return true;
      const options = { mode: 'readwrite' };
      if (await handle.queryPermission(options) === 'granted') return true;
      return await handle.requestPermission(options) === 'granted';
    } catch (err) {
      console.warn('Dateiberechtigung konnte nicht geprüft werden.', err);
      return false;
    }
  }

  async function writeBlobToFileHandle(handle, blob) {
    if (!handle) throw new Error('Kein Dateihandle verfügbar.');
    if (!await ensureFileHandlePermission(handle)) {
      const err = new Error('Keine Schreibberechtigung für die geladene Projektdatei.');
      err.name = 'NotAllowedError';
      throw err;
    }

    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function createProjectFileController({
    defaultName = 'handball-skizze.json',
    onStatus = () => {}
  } = {}) {
    let currentFileHandle = null;
    let currentFileName = defaultName;
    // Opening and saving share the browser's remembered project directory.
    const pickerId = 'handball-project';

    return {
      getCurrentName() {
        return currentFileName || defaultName;
      },

      setLoadedFile(file, handle = null) {
        currentFileHandle = handle || null;
        currentFileName = handle?.name || file?.name || defaultName;
        return currentFileName;
      },

      async pickOpenFile() {
        if (!('showOpenFilePicker' in global)) return null;

        try {
          const [handle] = await global.showOpenFilePicker({
            id: pickerId,
            ...(currentFileHandle ? { startIn: currentFileHandle } : {}),
            multiple: false,
            types: [{
              description: 'Handball-Skizzenprojekt',
              accept: { 'application/json': ['.json'] }
            }]
          });

          if (!handle) return { cancelled: true };
          const file = await handle.getFile();
          return { file, handle };
        } catch (err) {
          if (err && err.name === 'AbortError') {
            onStatus('Laden abgebrochen');
            return { cancelled: true };
          }
          console.warn('Native Dateiauswahl nicht verfügbar, verwende Datei-Upload-Fallback.', err);
          return null;
        }
      },

      async saveProjectBlob(blob) {
        const fileName = currentFileName || defaultName;

        if (currentFileHandle) {
          try {
            await writeBlobToFileHandle(currentFileHandle, blob);
            currentFileName = currentFileHandle.name || fileName;
            onStatus(`Projekt gespeichert: ${currentFileName}`);
            return { method: 'existing-handle', name: currentFileName };
          } catch (err) {
            console.warn('Direktes Speichern in die geladene Datei fehlgeschlagen.', err);
          }
        }

        if ('showSaveFilePicker' in global) {
          try {
            const handle = await global.showSaveFilePicker({
              id: pickerId,
              ...(currentFileHandle ? { startIn: currentFileHandle } : {}),
              suggestedName: fileName,
              types: [{
                description: 'Handball-Skizzenprojekt',
                accept: { 'application/json': ['.json'] }
              }]
            });

            await writeBlobToFileHandle(handle, blob);
            currentFileHandle = handle;
            currentFileName = handle.name || fileName;
            onStatus(`Projekt gespeichert: ${currentFileName}`);
            return { method: 'new-handle', name: currentFileName };
          } catch (err) {
            if (err && err.name === 'AbortError') {
              onStatus('Speichern abgebrochen');
              return { method: 'cancelled', name: fileName };
            }
            console.warn('Projekt konnte nicht im gewählten Speicherort gespeichert werden.', err);
            onStatus('Projekt nicht gespeichert. Bitte erneut speichern und einen beschreibbaren Speicherort wählen.');
            return { method: 'failed', name: fileName };
          }
        }

        const result = await saveBlobForUser(blob, fileName, onStatus);
        if (result.method === 'download') {
          onStatus(`Projekt als Download bereitgestellt: ${fileName}. Speicherort in den Browser-Einstellungen festlegen („Vor dem Speichern nachfragen“).`);
        }
        return result;
      },

      saveBlobForUser(blob, name) {
        return saveBlobForUser(blob, name, onStatus);
      }
    };
  }

  global.HandballProjectIO = {
    createProjectFileController,
    saveBlobForUser,
    writeBlobToFileHandle,
    ensureFileHandlePermission
  };
})(window);
