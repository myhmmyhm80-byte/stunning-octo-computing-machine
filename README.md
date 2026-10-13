# 🚀 LernPilot – Dein KI-Lern-Coach

Eine Lern-App für Schüler der Klassen 10 bis 12. Sie läuft im Browser und kann wie eine App auf dem Handy installiert werden.

## Was kann die App?

| Funktion | Was macht sie? |
|---|---|
| 💬 **Chatbot** | Beantwortet Fragen, auch zu **Fotos** (z. B. von Hausaufgaben). Er kennt dich und merkt sich wichtige Dinge. Du kannst auch per **Mikrofon** sprechen. |
| 👋 **Kennenlernen** | 35 Fragen am Anfang, zum Beispiel zu Bundesland, Klasse, Fächern, Sprachen und Lernstil. Danach passt alles zu dir. |
| 🎧 **Audio-Lektionen** | *Vorbereitung* (vor dem Unterricht), *Audio-Vorlesung* und *Zusammenfassung*. Du kannst **Stimme**, **Tempo** und **Denk-Pausen** (z. B. 20–40 Sekunden) zwischen den Abschnitten wählen. |
| ❓ **Quiz** | Quiz zu jedem Thema, auch aus deinem eigenen Text oder Foto. Du siehst sofort, ob deine Antwort richtig ist, mit Erklärung. |
| 🃏 **Lernkarten** | Karten aus einem **Foto** (z. B. einer Vokabelliste), aus Text oder von Hand. Mit Wiederholungs-System (Leitner) und Vorlesen. |
| 📅 **Lernplan** | Ein Wochenplan nur für dich, und die **Themen aus dem Lehrplan** deines Bundeslandes. |
| 🖨️ **Drucken / PDF** | Lektionen, Karten und Plan als Druckansicht in Schwarz-Weiß, mit dicker Schrift und den Lösungen. |
| 💾 **Speichern** | Alles bleibt auf deinem Gerät, auch nach dem Schließen. Du kannst eine Sicherung herunterladen. |

## Kosten

- Die App ist **kostenlos** und hat **keine eigenen Limits**.
- Die KI ist **Google Gemini**. Der Schlüssel ist kostenlos: <https://aistudio.google.com/apikey>.
  Google hat ein Tageslimit. Für eine Person reicht es aber normalerweise.
- Du kannst auch **Claude** (Anthropic) benutzen. Das kostet Geld, je nachdem wie viel du die KI benutzt.
- Die **Stimmen** kommen von deinem Gerät. Sie sind kostenlos und ohne Limit.

## App online stellen (einmalig, ca. 2 Minuten)

1. Auf GitHub dieses Repository öffnen → **Settings** → **Pages**.
2. Bei *Source*: **Deploy from a branch** wählen.
3. Bei *Branch*: den Branch mit der App wählen (`main` oder `claude/lernpilot-app`) und `/ (root)` → **Save**.
4. Nach 1–2 Minuten ist die App online unter:
   `https://<dein-github-name>.github.io/stunning-octo-computing-machine/`

> Hinweis: GitHub Pages ist bei einem **privaten** Repository nur mit einem bezahlten GitHub-Konto möglich. Bei einem öffentlichen Repository ist es kostenlos.

## Auf dem Handy installieren

- **Android (Chrome):** Seite öffnen → Menü ⋮ → **„App installieren“** oder **„Zum Startbildschirm hinzufügen“**.
- **iPhone (Safari):** Seite öffnen → Teilen-Knopf → **„Zum Home-Bildschirm“**.

Danach hast du ein **LernPilot-Symbol** auf dem Handy. Die App öffnet sich wie eine normale App.

## Technik (für Entwickler)

- Reines HTML, CSS und JavaScript. Es gibt keinen Server und keinen Build-Schritt.
- `js/app.js`: Navigation, Start, Fragebogen, Chat, Einstellungen
- `js/learn.js`: Lektionen, Quiz, Lernkarten, Lernplan
- `js/ai.js`: KI-Anschluss (Gemini über REST, Claude über das offizielle Anthropic-SDK in `vendor/`)
- `js/tts.js`: Vorlesen mit Denk-Pausen (Web Speech API)
- `js/store.js`: Speicher (IndexedDB)
- `sw.js`: Offline-Funktion (PWA)

Lokal starten: `python3 -m http.server` und dann <http://localhost:8000> öffnen.
