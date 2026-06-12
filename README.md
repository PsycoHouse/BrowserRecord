# BrowserRecord

BrowserRecord ist ein kleines, statisches Browser-Tool für Soundaufnahmen über das Mikrofon.

## Funktionen

- Audioaufnahme direkt im Browser über die MediaRecorder-API
- Moderne Oberfläche mit Live-Pegelanzeige und Timer
- Lokale Wiedergabe der aufgenommenen Audiodateien
- Download der Aufnahme als `webm`, `m4a` oder `ogg` – abhängig vom Browser
- Hinweis, dass gespeicherte Dateien im vom Browser konfigurierten Download-Ordner landen
- Verständliche Fehlermeldungen bei fehlender Browser-Unterstützung, verweigertem Mikrofonzugriff oder nicht gefundenem Mikrofon

## Starten

Öffne `index.html` direkt im Browser oder starte lokal einen kleinen Webserver:

```bash
python3 -m http.server 8000
```

Danach ist die App unter <http://localhost:8000> erreichbar.
