## Tool-Reihenfolge fuer Markdown-Aenderung

### 1. read (Vorbereitung)
**Warum:** Ich muss den aktuellen Zustand kennen bevor ich ihn aendere. Ich lese die komplette Datei um den Kontext zu verstehen und die exakte Zeile zu finden die geaendert werden soll.

### 2. edit (Aenderung)
**Warum:** edit ist praeziser als write. Ich kann die exakte Zeile finden und ersetzen ohne den Rest der Datei zu beeinflussen. Das ist sicherer als die ganze Datei neu zu schreiben.

### 3. read (Verifikation)
**Warum:** Ich muss sicherstellen dass die Aenderung wirklich durchgefuehrt wurde. Ich lese die Datei erneut um die neue Zeile zu verifizieren. Das ist Qualitaetssicherung.

**Prioritaet:** Sicherheit > Geschwindigkeit. Ich will keine Daten verlieren oder falsche Aenderungen machen.