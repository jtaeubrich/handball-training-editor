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

Der Proxy leitet `/api/chat` an Port 8787 weiter. Gesundheitstest: `GET /health` liefert `{"ok":true,"commandVersion":2}`. `commandVersion:2` bestätigt die Unterstützung des Beschriftungsversatzes. Der Dienst selbst spricht HTTP; TLS übernimmt der Host/Proxy. Im Container werden Editor und Secrets nicht ausgeliefert. Die statische Auslieferung ist nur eine lokale Entwicklungshilfe.

Der Zugangscode schützt die kostenpflichtige Schnittstelle und sollte nur an berechtigte Nutzer verteilt werden. Für eine größere öffentliche Nutzergruppe ist vor der Freigabe eine Nutzeranmeldung mit eigenen Kontingenten nötig. Der Dienst erlaubt derzeit insgesamt 20 Anfragen pro Minute und 2 parallele Anfragen **pro Prozess**. OpenAI-Aufrufe haben 45 Sekunden Zeit und höchstens 6.000 Ausgabe-Tokens. Den Verbrauch zusätzlich im OpenAI-Projekt überwachen. Mehrere Dienstinstanzen benötigen gemeinsame Limits; die aktuellen Zähler sind im Arbeitsspeicher.

## Verhalten und Protokoll

`POST /api/chat` benötigt `Authorization: Bearer <Zugangscode>` und `Content-Type: application/json`. Der Browser prüft Zeichenbefehle erneut und übernimmt eine Antwort nur, wenn die Skizze seit dem Absenden unverändert ist und kein Zeichen- oder Bearbeitungsschritt läuft. Eine vollständige Antwort mit mehreren Befehlen erzeugt genau einen Rückgängig-Schritt und wird lokal gesichert. Fehlerhafte Antworten ändern nichts. Zeichnen bleibt während der Anfrage möglich; die Antwort wird dann bei einem Konflikt verworfen.

Unterstützt werden Spieler und Geräte, Nummern und freie Labels, gerade/komplexe/Mehrpunkt-Wege, Verschieben, Beschriften und gezieltes Löschen. Positionen sind Meter im ungedrehten Feld. Die vorhandene Felddrehung wird im Editor berücksichtigt. Im Halbfeld liegt das Tor oben bei (10,0), bei einem Ganzfeld liegen die Tore links/rechts bei (0,10)/(40,10). „Links“ bedeutet links im ungedrehten Feld, nicht links auf dem gedrehten Bildschirm. `mode=none` verwendet eine abstrakte Fläche 20×20. Storyboard-Anlage und Spielfeldänderungen sind in dieser Ausbaustufe nicht vorgesehen.

`js/ai-commands.js` definiert Schema, Validierung, Koordinatenumrechnung und atomare Änderungen. `server/openai.cjs` ist der austauschbare Anbieteradapter. `store:false` deaktiviert das Speichern des Response-Objekts bei OpenAI; dies ist keine Zusage einer allgemeinen Nullspeicherung. Der Server schreibt weder Chattexte noch API-Schlüssel in Logs.

`label_offset` setzt die Beschriftungsposition für `attacker`, `attackerBall`, `defender` und alle unterstützten Pfade. Beispiel: `{"op":"label_offset","target":"object-0","x":0,"y":-30}`. Beide Achsen sind absolute ganzzahlige Canvas-Pixel im Bereich −50 bis +50; positive Werte zeigen rechts/unten. Der Versatz wird unabhängig von Zoom und Felddrehung in den Achsen der Zeichenfläche gesetzt. Er verschiebt das Label, verändert aber weder Objektposition noch Labeltext oder Sichtbarkeit. Der Befehl ist auch nach `add_symbol` oder `add_path` mit der neu vergebenen ID in derselben Antwort nutzbar. Für relative Folgeanweisungen enthält der aktuelle Skizzenkontext `labelOffsetX` und `labelOffsetY`. Ältere v99-Kontexte ohne beide Felder bleiben gültig. Editor und Dienst müssen für diesen Befehl aktualisiert sein; den Dienst zuerst bereitstellen.

## Tests

`npm run test:server` testet Dienst, Zugriffsschutz, Datenprüfung, Limits und OpenAI-Protokoll mit injizierten Antworten. `npm run test:e2e` prüft Chat, echtes Canvas-Rendering, Undo/Redo, Konflikte und Fehlerbehandlung mit abgefangenen HTTP-Antworten in Chromium und Firefox. Diese Tests brauchen keinen echten OpenAI-Schlüssel und verursachen keine API-Kosten. Eine erfolgreiche echte Modellantwort ist erst nach Einrichtung eines OpenAI-Projekts prüfbar.

Implementierungsgrundlage: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
