(function (global) {
  'use strict';

  const STORAGE_KEY = 'handballtrainer.localDraft.v1';

  function createLocalDraft({getSnapshot, restoreSnapshot, onError = () => {}, delay = 200}) {
    let timer = null;
    let lastSaved = null;
    let restoring = false;
    let reportedError = null;

    function report(error, message) {
      console.warn(message, error);
      if (reportedError !== message) onError(message);
      reportedError = message;
    }

    function flush() {
      global.clearTimeout(timer);
      timer = null;
      if (restoring) return false;
      try {
        const snapshot = JSON.stringify(getSnapshot());
        if (snapshot === lastSaved) return true;
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          schemaVersion: 1, savedAt: Date.now(), snapshot: JSON.parse(snapshot)
        }));
        lastSaved = snapshot;
        reportedError = null;
        return true;
      } catch (error) {
        report(error, 'Lokale Sicherung nicht möglich. Bitte die Zeichnung als Projektdatei speichern.');
        return false;
      }
    }

    return {
      flush,
      schedule() {
        if (restoring || timer !== null || global.document.hidden) return;
        timer = global.setTimeout(flush, delay);
      },
      restore() {
        restoring = true;
        try {
          const raw = global.localStorage.getItem(STORAGE_KEY);
          if (!raw) return false;
          const data = JSON.parse(raw);
          if (data?.schemaVersion !== 1 || !Array.isArray(data.snapshot?.project?.objects) ||
              !data.snapshot.project.objects.every(object => object &&
                ['symbol','path','freehand'].includes(object.kind))) {
            throw new Error('Ungültige lokale Sicherung.');
          }
          restoreSnapshot(data.snapshot);
          lastSaved = JSON.stringify(data.snapshot);
          return true;
        } catch (error) {
          report(error, 'Lokale Zeichnung konnte nicht wiederhergestellt werden. Projektdateien können weiterhin geladen werden.');
          return false;
        } finally {
          restoring = false;
        }
      }
    };
  }

  global.HandballLocalDraft = {STORAGE_KEY, createLocalDraft};
})(window);
