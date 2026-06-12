# BrowserRecord

BrowserRecord ist ein kleines, statisches Browser-Tool für Soundaufnahmen über das Mikrofon, aus Browser-Tabs und aus Meetings.

## Funktionen

- Audioaufnahme direkt im Browser über die MediaRecorder-API
- Auswahl zwischen Mikrofon, Tab-/Fenster-/Systemaudio oder einem Mix aus Tab/Systemaudio und Mikrofon
- Geeignet zum lokalen Aufzeichnen von Meetings, YouTube oder anderen Tabs, sofern der Browser die Audiofreigabe erlaubt
- Moderne Oberfläche mit Live-Pegelanzeige und Timer
- Lokale Wiedergabe der aufgenommenen Audiodateien
- Download der Aufnahme als `webm`, `m4a` oder `ogg` – abhängig vom Browser
- Hinweis, dass gespeicherte Dateien im vom Browser konfigurierten Download-Ordner landen
- Verständliche Fehlermeldungen bei fehlender Browser-Unterstützung, verweigertem Zugriff oder fehlender Audiofreigabe

## Starten

Öffne `index.html` direkt im Browser oder starte lokal einen kleinen Webserver:

```bash
python3 -m http.server 8000
```

Danach ist die App unter <http://localhost:8000> erreichbar.


## Hinweise zu Tab- und Meeting-Aufnahmen

Für Audio aus YouTube, Meetings oder anderen Tabs nutzt die App die Bildschirm-/Tab-Freigabe des Browsers. Wähle im Freigabe-Dialog einen Tab, ein Fenster oder den Bildschirm aus und aktiviere – falls angeboten – „Tab-Audio teilen“, „Systemaudio freigeben“ oder eine ähnlich benannte Option.

Wenn du in einem Meeting auch deine eigene Stimme aufnehmen möchtest, wähle in der App „Tab/Systemaudio + Mikrofon“. Dann mischt BrowserRecord das freigegebene Meeting-Audio mit deinem Mikrofon zu einer Audiodatei.
