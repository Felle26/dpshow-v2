# Error Codes

Diese Datei beschreibt die aktuell verwendeten Fehlercodes fuer Support.

## 1) Globaler Laufzeitfehler im Frontend

- Quelle: app/error.tsx
- Anzeige fuer Benutzer: Support-Code auf der Fehlerseite
- Format:
  - mit Next-Digest: ERR-{digest}
  - ohne Digest (Fallback): ERR-{zeit}-{zufall}
- Beispiel:
  - ERR-9f3c2a18
  - ERR-LX2A1M-5KQ8NZ

Hinweis fuer Support:

- Der angezeigte Support-Code reicht aus, um den Vorfall einem konkreten Fehlerbild zuzuordnen.

## 2) API-Validierung fuer Edit-Passwort

- Quelle: app/api/edit-password/route.ts
- Regel: Passwort darf nur aus Ziffern bestehen
- Fehlercode: EDIT_PASSWORD_NUMERIC_ONLY
- HTTP-Status: 400
- Antwort:

```json
{
  "success": false,
  "code": "EDIT_PASSWORD_NUMERIC_ONLY",
  "message": "Passwort darf nur Zahlen enthalten."
}
```

Hinweis fuer Support:

- Dieser Fehler tritt auf, wenn beim Setzen eines Passworts Nicht-Ziffern uebermittelt werden.

## 3) Empfohlener Support-Ablauf

1. Support-Code vom Fehlerbild notieren (falls vorhanden).
2. Zeitpunkt und betroffene Ansicht notieren (z. B. Show, Admin).
3. Reproduktionsschritte kurz dokumentieren.
4. Bei Passwortproblemen pruefen, ob nur Ziffern verwendet wurden.
