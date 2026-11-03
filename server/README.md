# Separater KI-Dienst

Der Editor bleibt auf GitHub Pages. Dieser kleine Node-Dienst läuft separat und ruft die OpenAI Responses API auf. Es werden ausschließlich strukturierte Zeichenbefehle zurückgegeben; weder Modellantworten noch Chattexte werden als JavaScript ausgeführt.

## Einrichtung

1. Node.js 24 installieren oder den Docker-Dienst verwenden.
2. `server/.env.example` nach `server/.env` kopieren. Die Datei ist von Git ausgeschlossen.
3. `OPENAI_API_KEY` und `OPENAI_MODEL` im Server setzen. Das Modell muss in deinem OpenAI-Projekt verfügbar sein und Responses API mit Structured Outputs unterstützen. Der Dienst wählt kein kostenpflichtiges Modell automatisch aus.
4. Einen eigenen zufälligen `AI_CHAT_TOKEN` mit mindestens 24 Zeichen setzen, z. B. erzeugt mit `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Dies ist der Zugangscode zum Chat, kein OpenAI-Schlüssel.
5. Unter `AI_ALLOWED_ORIGINS` die erlaubten Editor-Ursprünge eintragen, kommasepariert, ohne abschließenden Schrägstrich und ohne Repository-Pfad. Für dieses Repository: `https://jtaeubrich.github.io`.
6. Lokal aus dem Repository starten: `node --env-file=server/.env server/server.cjs`. Mit `SERVE_EDITOR=true` ist der Editor unter `http://127.0.0.1:8787` erreichbar.
7. Im Editor **KI-Chat → KI-Verbindung einrichten** öffnen, die Dienstadresse mit `/api/chat` und den Zugangscode eintragen. Der Code bleibt im Arbeitsspeicher der Seite und wird nach einem Neustart neu eingegeben. Die Dienstadresse wird lokal im Browser gemerkt.

Der Chat sendet erst beim ausdrücklichen Absenden. Der Verlauf bleibt nur für die aktuelle Seite erhalten. **Neuer Chat** löscht den Verlauf, aber keine Zeichnung. Die übertragenen Skizzendaten enthalten ausschließlich das aktive Feld mit Objektpositionen und Labels; keine Projektdateinamen oder Objekte anderer Felder. Ohne OpenAI-Konfiguration und Zugangscode antwortet der Dienst mit 503 und ruft OpenAI nicht auf.

## Cloud-Betrieb

Der Dienst ist für einen separaten Container oder Node-Prozess vorbereitet. Im Repository liegt kein Cloud-Konto und kein produktiver API-Schlüssel. Vor der ersten echten Nutzung müssen Hosting, HTTPS-Adresse und die oben genannten Server-Secrets eingerichtet werden. GitHub Pages allein führt diesen Dienst nicht aus.

Docker aus dem Repository bauen: `docker build -f server/Dockerfile -t handball-ki .`

Container hinter einem HTTPS-Reverse-Proxy oder auf einem Containerhost starten. Die Portfreigabe auf einem eigenen Server auf Loopback begrenzen:

```sh
docker run --rm --env-file server/.env -e HOST=0.0.0.0 -e SERVE_EDITOR=false -p 127.0.0.1:8787:8787 handball-ki
```

Der Proxy leitet `/api/chat` an Port 8787 weiter. Gesundheitstest: `GET /health` liefert `{"ok":true,"commandVersion":5}`. Version 5 unterstützt zusätzlich zu Feldlayout, Feldausrichtung, Feldkopien und Beschriftungsversatz auch Symbolgröße, Objektfarbe, Linienstärke, Drehung, Objektkopien, Pfadbearbeitung, Typwechsel, Labeloptionen, Vorgaben und vorbereitete Dateiaktionen. Der Dienst selbst spricht HTTP; TLS übernimmt der Host/Proxy. Im Container werden Editor und Secrets nicht ausgeliefert. Die statische Auslieferung ist nur eine lokale Entwicklungshilfe.

Der Zugangscode schützt die kostenpflichtige Schnittstelle und sollte nur an berechtigte Nutzer verteilt werden. Für eine größere öffentliche Nutzergruppe ist vor der Freigabe eine Nutzeranmeldung mit eigenen Kontingenten nötig. Der Dienst erlaubt derzeit insgesamt 20 Anfragen pro Minute und 2 parallele Anfragen **pro Prozess**. OpenAI-Aufrufe haben 45 Sekunden Zeit und höchstens 6.000 Ausgabe-Tokens. Den Verbrauch zusätzlich im OpenAI-Projekt überwachen. Mehrere Dienstinstanzen benötigen gemeinsame Limits; die aktuellen Zähler sind im Arbeitsspeicher.

## Verhalten und Protokoll

`POST /api/chat` benötigt `Authorization: Bearer <Zugangscode>` und `Content-Type: application/json`. Der Browser prüft Zeichenbefehle erneut und übernimmt eine Antwort nur, wenn die Skizze seit dem Absenden unverändert ist und kein Zeichen- oder Bearbeitungsschritt läuft. Eine vollständige Antwort mit mehreren Befehlen erzeugt genau einen Rückgängig-Schritt und wird lokal gesichert. Fehlerhafte Antworten ändern nichts. Zeichnen bleibt während der Anfrage möglich; die Antwort wird dann bei einem Konflikt verworfen.

Unterstützt werden Spieler und Geräte, Nummern und freie Labels, gerade/komplexe/Mehrpunkt-Wege, Verschieben, Beschriften und gezieltes Löschen. Positionen sind Meter im ungedrehten Feld. Die vorhandene Felddrehung wird im Editor berücksichtigt. Im Halbfeld liegt das Tor oben bei (10,0), bei einem Ganzfeld liegen die Tore links/rechts bei (0,10)/(40,10). „Links“ bedeutet links im ungedrehten Feld, nicht links auf dem gedrehten Bildschirm. `mode=none` verwendet eine abstrakte Fläche 20×20.

Seit v102 enthält `scene.cells` alle Felder samt Objekten und `scene.layout` die Anordnung. Die bisherigen Felder auf `scene` beschreiben weiterhin das aktive Feld. `layout` setzt `cols` (1–4) und `rows` (1–2), maximal acht Felder. Die Nummerierung ist zeilenweise und 1-basiert. `select_cell` mit `cell` wählt das Feld für folgende Objektbefehle. `configure_cell` mit `cell`, `mode` (`half`, `full`, `none`) und `rotation` (0/90/180/270) setzt den Feldtyp und die Drehung im Uhrzeigersinn. Objekte behalten ihre Meterkoordinaten und werden mitgeführt; Symbolgröße und Linienbreite bleiben gleich. Bei Verkleinerung des Feldtyps können bisherige Positionen außerhalb der neuen Spielfeldlinien liegen und sollten bei Bedarf mit `move` angepasst werden. `copy_cell` mit `source` und `target` kopiert Feld und Objekte in ein anderes, leeres Feld. Kopierte Objekte erhalten erst mit der nächsten Anfrage eigene Referenzen. Belegte Felder können nicht durch Layout-Verkleinerung entfernt oder durch Kopieren überschrieben werden. Alle Änderungen einer Antwort sind ein gemeinsamer Rückgängig-Schritt einschließlich Layout und Feldtyp. Ältere Kontexte ohne `cells` bleiben gültig, können jedoch keine neuen Feldbefehle verwenden. Den Dienst vor dem Editor aktualisieren.

`js/ai-commands.js` definiert Schema, Validierung, Koordinatenumrechnung und atomare Änderungen. `server/openai.cjs` ist der austauschbare Anbieteradapter. `store:false` deaktiviert das Speichern des Response-Objekts bei OpenAI; dies ist keine Zusage einer allgemeinen Nullspeicherung. Der Server schreibt weder Chattexte noch API-Schlüssel in Logs.

`label_offset` setzt die Beschriftungsposition für `attacker`, `attackerBall`, `defender` und alle unterstützten Pfade. Beispiel: `{"op":"label_offset","target":"object-0","x":0,"y":-30}`. Beide Achsen sind absolute ganzzahlige Canvas-Pixel im Bereich −50 bis +50; positive Werte zeigen rechts/unten. Der Versatz wird unabhängig von Zoom und Felddrehung in den Achsen der Zeichenfläche gesetzt. Er verschiebt das Label, verändert aber weder Objektposition noch Labeltext oder Sichtbarkeit. Der Befehl ist auch nach `add_symbol` oder `add_path` mit der neu vergebenen ID in derselben Antwort nutzbar. Für relative Folgeanweisungen enthält der aktuelle Skizzenkontext `labelOffsetX` und `labelOffsetY`. Ältere v99-Kontexte ohne beide Felder bleiben gültig. Editor und Dienst müssen für diesen Befehl aktualisiert sein; den Dienst zuerst bereitstellen.

Seit v103 stehen drei Stilbefehle zur Verfügung: `symbol_size` mit `target` und `size` (12–100 Canvas-Pixel) für Symbole; `color` mit `target` und einem sechsstelligen Hex-Farbwert wie `#d32f2f` für Symbole, Wege und Freihandlinien; `line_width` mit `target` und `width` (1–10 Canvas-Pixel in 0,5-Schritten) für Wege und Freihandlinien. Die Werte sind absolut und unabhängig von Zoom und Feldausrichtung. Die Befehle verändern ausschließlich die genannte Eigenschaft, keine globalen Vorgaben oder anderen Objekte. Sie funktionieren auch nach `add_symbol`/`add_path` mit einer neuen ID in derselben Antwort. Feldwechsel erfolgen weiterhin mit `select_cell`.

Kontexte ab Version 4 senden `commandVersion` und pro Objekt `style:{color,size,width}`. Nicht anwendbare oder unbekannte Werte sind `null`; bestehende Werte werden für relative Wünsche wie „20 % größer“ übermittelt. Für importierte Altobjekte können die gemeldeten Größen außerhalb der neuen Befehlsgrenzen liegen, bleiben aber unverändert, bis sie ausdrücklich geändert werden. Ältere Kontexte ohne Stilwerte bleiben gültig; ohne `commandVersion` 4 oder höher werden Stilbefehle nicht angewendet. Den Dienst zuerst aktualisieren, danach den Editor. Rückgängig, lokale Sicherung und Canvas-/SVG-Export verwenden dieselben nativen Objekte.

Seit v104 (`commandVersion:5`) kommen folgende Befehle hinzu:

- `rotate {target,angle}`: absolute Ausrichtung eines drehbaren Symbols, 0–359 ganze Grad in Canvas-Achsen.
- `rotate_group {targets,angle,center:{x,y}}`: relative Drehung einer Gruppe von Symbolen/Wege im aktiven Feld, −360 bis 360 ganze Grad. Das Zentrum ist in ungedrehten Feldmetern angegeben. Alle geometrischen Punkte und Labelversätze werden mitgeführt. Objekte dürfen ihr Zeichenfeld dabei nicht verlassen.
- `copy_object {source,id,x,y}`: native Kopie im aktiven Feld mit neuer ID und absoluter Position bzw. Pfadstart. Die neue ID kann in derselben Antwort verwendet werden.
- `symbol_type {target,type}`: Symboltyp wechseln, Eigenschaften erhalten und Labeloptionen an den Zieltyp anpassen.
- `edit_path {target,type,points}`: bestehenden Weg samt Stütz-/Kontrollpunkten ersetzen; gerade 2, Kurven 4, Mehrpunktwege 2–50 Punkte. Farbe, Stärke und Labels bleiben erhalten. So Segmente ergänzen/entfernen und Wegtypen wechseln.
- `label_options {target,visible,set,label}`: Sichtbarkeit und Labelset. `keep` mit `label:null` blendet ohne Textverlust ein/aus. Angreifer unterstützen `33/24/numbers/custom`, Abwehr `321/60/numbers/custom`, Wege `keep/custom`. Bei einem neuen Set mit `label:null` bleibt ein passender Text erhalten, andernfalls wird dessen erster Eintrag verwendet.
- `defaults {symbolSize,strokeWidth,strokeColor,markerColor}`: globale Vorgaben, unveränderte Werte `null`. Größen-/Farbgrenzen wie bei Stilbefehlen. Wirkt auf nachfolgende KI- und manuelle Objekte, nicht auf bestehende. Spieler behalten ihre Standardfarben. Neue Wege berücksichtigen die globale Linienfarbe. Die Vorgaben sind Bestandteil von Projektdatei, lokaler Sicherung und Historie.
- `project_action {action}`: `undo/redo` nur als alleiniger Befehl und nur bei verfügbarer Historie. `save/load/export_svg/export_png` müssen am Ende stehen. Sie bereiten im Chat einen Aktionsbutton vor; der Nutzer öffnet damit den Browser-Dateidialog. Es werden keine lokalen Pfade oder Dateiinhalte an das Modell übertragen. Nach zwischenzeitlichen Änderungen wird der Button als veraltet abgelehnt. Eine reine Dateiaktion erzeugt keinen Historieneintrag.

Der Kontext enthält außerdem `editor:{defaults,canUndo,canRedo}` und pro Objekt `editing:{rotation,showLabel,labelSet}`. `label` enthält auch ausgeblendeten Text. Ältere Kontexte der Versionen 4 und ohne Versionsangabe bleiben gültig; die neuen Befehle erfordern Version 5. Felddarstellung, Zoom/Ausschnitt und neue Freihandzeichnungen werden nicht gesteuert. Der Client prüft vor der Übernahme auch Vorgaben und Historienzustand auf zwischenzeitliche Änderungen.

## Tests

`npm run test:server` testet Dienst, Zugriffsschutz, Datenprüfung, Limits und OpenAI-Protokoll mit injizierten Antworten. `npm run test:e2e` prüft Chat, echtes Canvas-Rendering, Undo/Redo, Konflikte und Fehlerbehandlung mit abgefangenen HTTP-Antworten in Chromium und Firefox. Diese Tests brauchen keinen echten OpenAI-Schlüssel und verursachen keine API-Kosten. Eine erfolgreiche echte Modellantwort ist erst nach Einrichtung eines OpenAI-Projekts prüfbar.

Implementierungsgrundlage: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
