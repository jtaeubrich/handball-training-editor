# Handballtrainer – Skizzeneditor

Der Handballtrainer-Skizzeneditor ist ein browserbasierter Editor zum Erstellen von Trainingsskizzen, Spielformen und taktischen Darstellungen für Handball.

Die Anwendung läuft vollständig im Browser und kann auf dem iPad als Web-App zum Home-Bildschirm hinzugefügt werden.

## Installation auf dem iPad

### Variante 1: Als Web-App installieren

1. Die veröffentlichte GitHub-Pages-Seite in **Safari** auf dem iPad öffnen.
2. In Safari auf **Teilen** tippen.
3. **Zum Home-Bildschirm** auswählen.
4. Falls angeboten, **Als Web-App öffnen** aktivieren.
5. **Hinzufügen** wählen.

Danach erscheint der Skizzeneditor wie eine normale App auf dem Home-Bildschirm.

Vorteile:
- kein störender Browserrahmen
- mehr Platz für den Editor
- direkter Start über das App-Icon
- Offline-Nutzung möglich, sobald die Anwendung einmal vollständig geladen wurde

### Variante 2: Direkt im Safari-Browser verwenden

Die Anwendung kann auch direkt in Safari genutzt werden.

Beim Speichern gilt auf dem iPad:
- PNG kann über die iPad-Freigabe als Bild gespeichert werden
- SVG kann über **In Dateien sichern** als Datei abgelegt werden
- Projektdateien im JSON-Format können ebenfalls über **In Dateien sichern** gespeichert werden

## Wesentliche Funktionen

### Spielfeld

Unterstützt werden:
- halbes Spielfeld
- ganzes Spielfeld
- kein Spielfeld
- Drehung in 90°-Schritten
- verschiedene Farbschemata
- einblendbares Raster
- einstellbare Sektordeckkraft

Bei mehreren Zellen können unterschiedliche Spielfelder pro Zelle verwendet werden.

Wird ein Spielfeld gedreht, drehen sich die zugehörigen Objekte mit und behalten ihre relative Position im Spielfeld.

### Storyboard / mehrere Zellen

Der Editor unterstützt Rasterlayouts von:
- 1×1
- 2×1
- 3×1
- 4×1
- 1×2
- 2×2
- 3×2
- 4×2

Jede Zelle kann separat konfiguriert werden.

Eine Zelle kann mit dem Duplizieren-Button in die nächste Zelle kopiert werden. Dabei werden Spielfeld-Einstellungen und enthaltene Objekte übernommen.

### Spieler und Trainer

Verfügbare Symbole:
- Angreifer
- Angreifer mit Ball
- Abwehrspieler
- Torwart
- Anspieler
- Trainer

Neue Angriffsspieler werden automatisch zum Tor ausgerichtet.

Neue Abwehrspieler werden automatisch in Richtung Mittellinie ausgerichtet.

Alle rotierbaren Symbole können anschließend frei gedreht werden.

### Aktionen und Laufwege

Unterstützt werden unter anderem:
- Laufweg
- komplexer Laufweg
- Mehrpunkt-Laufweg
- Pass
- komplexer Pass
- Passtäuschung
- Laufweg mit Ball
- Tippen
- Prellen
- Torwurf
- Torwurftäuschung
- Sperre
- komplexe Sperre
- Mehrpunkt-Sperre

Viele Aktionen können als gerade, komplexe oder Mehrpunkt-Variante angelegt werden.

### Beschriftungen

Spieler und Aktionen können beschriftet werden.

Mögliche Einstellungen:
- Label ein-/ausblenden
- Text frei vergeben
- Position oben, unten, links, rechts oder zentriert
- freie X-/Y-Verschiebung
- Label-Farbe

### Mehrfachauswahl

Mehrere Objekte können mit Shift, Ctrl/Cmd oder per Auswahlrechteck ausgewählt werden.

Für gemeinsam unterstützte Eigenschaften können mehrere Objekte gleichzeitig geändert werden, zum Beispiel:
- Größe
- Farbe
- Drehung
- Label-Einstellungen

Mehrere ausgewählte Objekte können außerdem gemeinsam um ihren gemeinsamen Mittelpunkt gedreht werden.

### Kopieren und Verschieben

Mehrere Objekte lassen sich gemeinsam verschieben.

Mit Ctrl/Cmd + Klick auf eine bestehende Auswahl kann eine Kopie erzeugt und direkt verschoben werden.

### Sonstige Elemente

Unter **Sonstiges** stehen zur Verfügung:
- Hütchen
- Reifen
- Markierung
- Turnbank
- Sportmatte
- Weichbodenmatte

Diese Elemente können ebenfalls verschoben, skaliert, eingefärbt und – soweit sinnvoll – gedreht werden.

### Speichern und Export

Unterstützt werden:
- Projekt speichern als JSON
- Projekt laden
- Export als PNG
- Export als SVG

Die Projektdatei enthält die komplette Bearbeitungssituation und kann später wieder geöffnet werden.

PNG eignet sich besonders zum Teilen oder für Präsentationen.

SVG bleibt als Vektorgrafik editierbar und eignet sich für weitere Bearbeitung in entsprechenden Grafikprogrammen.

## Bedienhinweise

- Auswahlmodus aktivieren, um Objekte zu verschieben oder zu bearbeiten.
- Auf freier Fläche ziehen, um mehrere Objekte über ein Auswahlrechteck zu markieren.
- Shift/Ctrl/Cmd verwenden, um eine bestehende Auswahl zu erweitern.
- Ctrl/Cmd + Klick auf eine bestehende Auswahl erstellt eine Kopie.
- Delete/Backspace löscht die aktuelle Auswahl.
- Undo und Redo stehen für die letzten Bearbeitungsschritte zur Verfügung.
- Mit dem Zoom-Regler kann die Darstellung vergrößert oder verkleinert werden.

## GitHub Pages

Für die Veröffentlichung werden typischerweise diese Dateien im Repository verwendet:

- `index.html`
- `js/` (Projektdateien, Export, Geometrie, Zustand, Auswahl und Rendering)
- `manifest.webmanifest`
- `service-worker.js`
- `icons/`
- `.nojekyll`

GitHub Pages kann anschließend direkt aus dem `main`-Branch und dem Root-Verzeichnis veröffentlicht werden.

## Entwicklung und Regressionstests (v90)

Das objektbezogene Canvas-Rendering liegt in `js/renderer-canvas.js`, das SVG-Rendering einschließlich Spielfeld in `js/renderer-svg.js`. Beide Renderer erhalten ihre benötigten Geometrie- und Beschriftungsfunktionen ausdrücklich vom Editor. Auswahlrahmen, Handles und Bedienlogik bleiben in `index.html`.

Tests ausführen: `npm ci`, `npx playwright install chromium`, danach `npm run test:e2e`. Der Testserver benötigt nur Node.js. GitHub Actions verwendet dieselben Abhängigkeiten aus `package-lock.json`; überholte Testläufe derselben Branch werden durch die bestehende concurrency-Regel abgebrochen.

Die Renderingtests vergleichen Canvas-Zeichenbefehle und SVG-Ausgaben mit dem Stand v89 (Commit `49627eac1f8e32a7af7eb032919c7a37c1653051`). Die Referenzfälle decken alle Symbole und Pfadvarianten, Beschriftungen, Pfade ohne Länge sowie SVG-Spielfelder ab. Formatierungs-Einrückungen und numerische Unterschiede jenseits von acht Nachkommastellen werden beim Vergleich ignoriert.

Referenzwerte nur bei beabsichtigten Änderungen erneuern: Testserver mit `node tests/server.cjs` starten, dann in einem zweiten Terminal `node tests/capture-rendering-baseline.cjs` ausführen. Das Skript liest ausdrücklich den ursprünglichen v89-Commit aus der lokalen Git-Historie; es übernimmt keine Ausgaben der aktuellen Implementierung.

## Hinweis

Der Editor ist für die Nutzung als browserbasierte Trainingshilfe gedacht. Änderungen an Projektdateien sollten regelmäßig gespeichert werden, insbesondere vor einem Browser- oder Gerätewechsel.
