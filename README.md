# Handballtrainer Skizzeneditor – GitHub Pages / iPad PWA

## Veröffentlichung über GitHub Pages

1. Neues GitHub-Repository anlegen, z. B. `handballtrainer`.
2. Den Inhalt dieses Ordners in das Root-Verzeichnis des Repositorys hochladen.
3. In GitHub: **Settings → Pages**.
4. Unter **Build and deployment** bei **Source**: `Deploy from a branch`.
5. Branch `main`, Ordner `/ (root)` auswählen und speichern.
6. Nach dem Deployment die von GitHub Pages angezeigte URL in Safari auf dem iPad öffnen.
7. Safari: **Teilen → Zum Home-Bildschirm → Als Web-App öffnen → Hinzufügen**.

## Dateien

- `index.html` – aktueller Handball-Skizzeneditor
- `manifest.webmanifest` – PWA-Metadaten
- `service-worker.js` – Offline-Cache
- `icons/` – App-Icons
- `.nojekyll` – verhindert Jekyll-Verarbeitung
