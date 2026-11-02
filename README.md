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

Ab v95 wird die letzte Zeichnung automatisch lokal in diesem Browser auf diesem Gerät gesichert und beim nächsten Start wieder angezeigt. Gespeichert werden Objekte, Beschriftungen, Spielfeld, Storyboard, Zoom und der bisherige Projektname. Änderungen werden während der Arbeit und beim Wechsel in den Hintergrund gesichert. Erkennbare Teile unterbrochener Pfade und Freihandzeichnungen werden beim Wiederöffnen als bearbeitbare Objekte übernommen. **Zeichnung leeren** sichert bewusst auch den leeren Stand.

Diese lokale Sicherung ersetzt keine Projektdatei und wird nicht zwischen Geräten übertragen. Beim Löschen der Websitedaten geht sie verloren; im privaten Browsermodus kann sie nach dem Schließen verschwinden. Die Berechtigung zum direkten Überschreiben einer zuvor geöffneten Datei wird beim Neustart nicht übernommen; deren Dateiname bleibt erhalten.

Ab v91 speichert **Projekt speichern** in Browsern mit Dateizugriff (z. B. Chrome/Edge am Computer) direkt in die über **Projekt laden** geöffnete Datei. Falls das nicht möglich ist, öffnet sich ein Speicherdialog mit dem bisherigen Dateinamen und der geöffneten Datei als Startort. Öffnen und Speichern verwenden denselben gemerkten Projektordner; der Downloads-Ordner wird nicht mehr vorgegeben.

Browser ohne diesen Dateizugriff geben beim Laden keinen ursprünglichen Ordner an die Webseite weiter. Hier entscheidet der Browser über den Download-Ordner. Für einen Speicherdialog bei jedem Download die Browser-Einstellung **Vor dem Speichern nachfragen** aktivieren; der Editor kann den ursprünglichen Ordner in diesem Fall nicht vorauswählen.

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

## Entwicklung und Regressionstests (v98)

**KI-Chat:** Das aufklappbare Chatfenster kann das aktive Feld anhand einer Textbeschreibung bearbeiten: Spieler und Geräte platzieren, Nummern und freie Labels vergeben, Wege zeichnen sowie vorhandene Objekte verschieben oder gezielt entfernen. Alle Befehle einer Antwort werden gemeinsam geprüft und bilden einen Rückgängig-Schritt. Bei zwischenzeitlichen manuellen Änderungen werden die KI-Änderungen verworfen. Der Chat ist auch auf Smartphones bedienbar; Nachrichten werden erst beim Senden übertragen.

Für echte KI-Antworten braucht der Editor einen separat eingerichteten OpenAI-Dienst. GitHub Pages stellt nur die Oberfläche bereit. Node-Dienst, Docker-Datei, Zugangsschutz und Einrichtung stehen unter [server/README.md](server/README.md). Ohne Dienstadresse und serverseitige Konfiguration ist noch kein echter KI-Chat möglich. OpenAI-Schlüssel gehören ausschließlich auf den Server. Server- und Browser-Tests verwenden kontrollierte Antworten und verursachen keine API-Kosten.

Während ein Mehrpunktpfad gezeichnet wird, entfernt Rückgängig jeweils den letzten gesetzten Punkt mit seinem Segment. Der verbleibende Pfad bleibt sichtbar und kann weitergezeichnet werden. Wiederholen stellt entfernte Punkte wieder her; ein neuer Punkt verwirft den zurückgenommenen Zweig. Nach dem Abschließen gilt Rückgängig wieder für den gesamten Pfad als Objekt.

Angreifer mit und ohne Ball sowie Abwehrspieler bieten zusätzlich das Label-Set **Zahlen 1–10** und **Freie Eingabe** (bis zu 24 Zeichen). Die bisherigen Positionssets bleiben erhalten. Die gewählten Sets und Texte werden in Projektdateien und der lokalen Sicherung gespeichert; im SVG werden freie Texte korrekt maskiert.

Auf Smartphones passt die automatische Ansicht ein einzelnes Spielfeld in die verfügbare Breite ein und zentriert es. Die Toröffnung entspricht 3 m auf 20 m Spielfeldbreite (15 % der zugehörigen Torlinienbreite) und liegt in deren Mitte, auch bei gedrehten Feldern. Bei mehreren Storyboard-Zellen wird das gesamte Raster eingepasst. Manuell eingestellter Zoom hat Vorrang und wird beim Wiederöffnen beibehalten. Der Ansichtsmodus wird im Projekt als `layout.fitToWidth` gespeichert; ältere Projekte mit dem Standardzoom werden automatisch eingepasst.

Das objektbezogene Canvas-Rendering liegt in `js/renderer-canvas.js`, das SVG-Rendering einschließlich Spielfeld in `js/renderer-svg.js`. `js/renderer-court.js` zeichnet die Canvas-Spielfelder, Raster und Storyboards. Die Renderer erhalten ihre benötigten Geometrie- und Beschriftungsfunktionen ausdrücklich vom Editor. Auswahlrahmen und die Verbindung der Module bleiben in `index.html`.

`js/tools.js` verwaltet Werkzeugwechsel, Gruppen, Varianten und die gespeicherte Werkzeugreihenfolge. `js/interactions.js` behandelt Platzieren, Verschieben, Kopieren, Drehen, Auswahlrechtecke, Pfadpunkte, Beschriftungsversatz und Tastenkürzel. `js/mobile.js` bündelt mobile Menüs, die Weiterleitung der Einstellungen sowie Touch-, Zoom- und Verschiebegesten. Die Module teilen den ausdrücklich übergebenen `editorState`; Bedienelemente und Aktionen werden als Abhängigkeiten übergeben. Die einmalige Installation registriert Touch-Capture vor den normalen Pointer-Handlern. Wiederholte Installation erzeugt keine doppelten Handler.

Die mobile Wege-Auswahl nennt auf jeder Schaltfläche die Aktion (z. B. Laufweg, Ballweg / Passweg oder Torwurf) und darunter die Variante Einfach, Komplex oder Mehrpunkt. Tests prüfen alle 21 Varianten auf 320 und 390 Pixel breiten Ansichten sowie die unveränderte Werkzeugauswahl.

`js/local-draft.js` verwaltet die lokale Sicherung unter dem versionsunabhängigen Schlüssel `handballtrainer.localDraft.v1`. Es speichert abgeschlossene Bearbeitungsschritte unmittelbar und laufende Zeichenänderungen höchstens alle 200 ms. `visibilitychange` und `pagehide` schreiben ausstehende Änderungen synchron; die Sicherung läuft bei Hintergrundwechsel vor der Touch-Bereinigung. Dateien und lokale Wiederherstellung verwenden dieselbe Aufbereitung der Projektdaten. Fehler beim Lesen oder Schreiben blockieren die Bearbeitung nicht.

`js/object-model.js` verwaltet die Objekttypen, Werkzeugklassifizierung, Beschriftungslisten, Standardwerte für neue Symbole, Pfade und Freihandzeichnungen sowie die bisherige Normalisierung geladener Objekte. Das Modul benötigt keinen DOM-Zugriff. Aktuelle Werkzeugwerte und die vom Spielfeld abhängige Spielerdrehung werden beim Erstellen übergeben. Bestehende Unterschiede zwischen neuen und geladenen Objekten bleiben erhalten; unbekannte Projektfelder werden nicht entfernt.

Die Objektmodelltests vergleichen Symbolvorgaben und die Aufbereitung älterer Objekte mit Referenzwerten aus v91 (Commit `b39e2dc703ea0499235e99277a6670bfebbb54c7`). Weitere Tests prüfen alle 21 Pfadvarianten, Freihandzeichnungen, Laden/Speichern sowie das Anlegen über die Oberfläche mit Rückgängig/Wiederholen.

Die Referenzwerte des Objektmodells lassen sich mit `node tests/capture-object-model-baseline.cjs` aus diesem ursprünglichen Commit erneut erzeugen. Das Skript benötigt dessen lokale Git-Historie und liest keine Vorgaben der aktuellen Implementierung.

Tests ausführen: `npm ci`, `npx playwright install chromium firefox`, danach `npm run test:e2e`. Der Testserver benötigt nur Node.js. Die Desktop-Tests laufen in Chromium und Firefox. Der Test mit injizierten echten Mehrfinger-Ereignissen nutzt das Chromium-Debugging-Protokoll und wird nur in Chromium ausgeführt. GitHub Actions verwendet dieselben Abhängigkeiten aus `package-lock.json`; überholte Testläufe derselben Branch werden durch die bestehende concurrency-Regel abgebrochen.

Die Renderingtests vergleichen Canvas-Zeichenbefehle und SVG-Ausgaben mit dem Stand v89 (Commit `49627eac1f8e32a7af7eb032919c7a37c1653051`). Die Referenzfälle decken alle Symbole und Pfadvarianten, Beschriftungen, Pfade ohne Länge sowie SVG-Spielfelder ab. Formatierungs-Einrückungen und numerische Unterschiede jenseits von acht Nachkommastellen werden beim Vergleich ignoriert.

Referenzwerte nur bei beabsichtigten Änderungen erneuern: Testserver mit `node tests/server.cjs` starten, dann in einem zweiten Terminal `node tests/capture-rendering-baseline.cjs` ausführen. Das Skript liest ausdrücklich den ursprünglichen v89-Commit aus der lokalen Git-Historie; es übernimmt keine Ausgaben der aktuellen Implementierung.

Die Canvas-Spielfeldtests vergleichen 50 Konfigurationen mit v92 (`e03520a4257d58b017f92f3607e07948095d5ca3`): alle Spielfeldmodi und Drehungen, zwei Farbschemata, Raster sowie gemischte Storyboards und Sektortransparenzen. Diese Referenzen lassen sich bei laufendem Testserver mit `node tests/capture-court-baseline.cjs` aus dem ursprünglichen Commit erzeugen.

Seit v98 beträgt die Toröffnung korrekt 3 m bei 20 m Spielfeldbreite. Für den Vergleich mit den unveränderten historischen Referenzen werden ausschließlich die mittigen Torrechtecke auf deren damalige Breite zurückgerechnet. Zusätzliche Maßprüfungen verlangen unabhängig davon die neue 3-m-Breite und die Zentrierung in Canvas und SVG.

## Hinweis

Der Editor ist für die Nutzung als browserbasierte Trainingshilfe gedacht. Änderungen an Projektdateien sollten regelmäßig gespeichert werden, insbesondere vor einem Browser- oder Gerätewechsel.
