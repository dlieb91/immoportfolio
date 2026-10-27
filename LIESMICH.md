# ImmoPortfolio · Zahlenkompass

Lokale App zur Verwaltung eines Immobilien-Portfolios für Kapitalanleger.
Keine Cloud, keine Installation – die Daten bleiben dort, wo du sie hinlegst.

## Starten

Doppelklick auf **`Start.bat`**.

Es öffnet sich ein Konsolenfenster (bitte offen lassen) und danach automatisch
Chrome oder Edge mit der App.

Voraussetzungen: Node.js und Chrome oder Edge.

## Erster Start

1. „Neues Portfolio anlegen" klicken
2. Einen Ordner wählen, z. B. `Dokumente\Immobilien-Portfolio`
3. Namen vergeben – fertig

Ab dann wird alles automatisch gespeichert. Beim nächsten Start erscheint das
Portfolio als „zuletzt verwendet" und wird mit einem Klick geöffnet.

## Wo die Daten liegen

Die App kennt zwei Ablagen. Beide haben denselben Aufbau, nur einen anderen Ort:

```
portfolio.json      alle Daten (lesbares JSON)
bilder/             Objektfotos, verkleinert auf max. 1600 px
bilder/thumbs/      Vorschaubilder
dokumente/          angehängte PDFs
backups/            tägliche Sicherung, die letzten 20
```

**Ordner auf diesem Rechner** – der Normalfall. Braucht Chrome oder Edge; Safari
und Firefox können nicht auf einen Ordner zugreifen. Die Dateien sind sichtbar und
lassen sich außerhalb der App ansehen, kopieren und sichern. Der Ordner darf
bedenkenlos in OneDrive oder Dropbox liegen.

**Dropbox** – wenn mehrere Geräte denselben Stand sehen sollen. Die App arbeitet dabei
immer zuerst im Gerätespeicher und gleicht daneben ab; ohne Netz geht die Arbeit normal
weiter und alles wird nachgeholt. Einrichtung und Konfliktbehandlung stehen weiter unten
unter *Abgleich mit Dropbox*.

**Auf diesem Gerät** – für Geräte ohne Ordnerzugriff, vor allem das iPad. Die App
legt dieselbe Struktur im Browserspeicher (IndexedDB) ab. Zwei Dinge sind dabei zu
wissen:

- Der Speicher gehört zu **diesem Browser auf diesem Gerät**. Ein anderes Profil
  oder ein privates Fenster sieht ihn nicht.
- **Auf iPhone und iPad löscht Safari ihn nach sieben Tagen ohne Besuch.** Davon
  ausgenommen sind nur Web-Apps auf dem Home-Bildschirm – die haben ihren eigenen,
  von Safari getrennten Speicher. Lege die App deshalb über *Teilen → Zum
  Home-Bildschirm* ab, bevor du sie ernsthaft benutzt.

In beiden Fällen gilt: Über *Einstellungen → Als Datei exportieren* bekommst du
jederzeit eine `.json` zum Mitnehmen. **Export und Import übertragen nur die Daten,
nicht die Bilder und Dokumente.**

## Auf dem iPad benutzen

Die App ist eine Web-App und braucht dafür eine Adresse, die das iPad erreicht –
`Start.bat` allein genügt nicht, denn der Server lauscht nur auf dem eigenen
Rechner.

Zum Ausprobieren im eigenen WLAN:

```
IMMO_HOST=0.0.0.0 node server.js
```

Der Server nennt dann die Adressen, unter denen er im Heimnetz erreichbar ist.
Das ist **unverschlüsselt und ohne Anmeldung** – zum Ausprobieren gedacht, nicht
für den Dauerbetrieb und auf keinen Fall fürs Internet.

Für den richtigen Betrieb gehören die Dateien auf einen Webspeicher mit HTTPS
(etwa Cloudflare Pages oder GitHub Pages, beides kostenlos). HTTPS ist keine
Förmlichkeit: Ohne sicheren Kontext gibt es weder Offline-Betrieb noch den
Dropbox-Abgleich – der Browser gibt `crypto.subtle` und Service Worker nur im
sicheren Kontext frei.

Danach auf dem iPad in Safari öffnen und über *Teilen → Zum Home-Bildschirm*
ablegen. Erst damit ist der Speicher dauerhaft (siehe oben) und die App startet
im Vollbild.

### Bedienung mit dem Finger

Die App passt sich an, statt eine zweite Oberfläche zu führen – es gibt nur einen
Satz Ansichten zu pflegen. Zwei Dinge werden dabei getrennt beantwortet:

- **Womit bedient wird** (`pointer: coarse`): Schaltflächen, Felder und
  Menüeinträge werden fingergerecht groß. Eingabefelder bekommen 16 px Schrift –
  darunter zoomt Safari beim Antippen ungefragt in das Feld hinein.
- **Wie breit der Bildschirm ist** (unter 900 px): Die Seitenleiste wird zur
  Schublade mit Menüknopf, und die **Listen werden zu Karten** – jede Zeile eine
  Karte, jeder Wert mit seiner Spaltenüberschrift davor.

Ein schmales Fenster am Rechner braucht keine fingergroßen Flächen, ein iPad im
Querformat sehr wohl – deshalb die Trennung.

**Die Jahrestabellen in Forecast und Einzelobjekt bleiben Tabellen** und scrollen
waagerecht. Eine Jahresreihe nebeneinander zu lesen ist der ganze Zweck; als
Kartenstapel wäre sie wertlos.

In Diagrammen zeigt ein **Tipp** den Wert an. Er bleibt stehen, bis woanders
getippt wird – mit dem Finger gibt es kein Darüberfahren, und beim Abheben
verschwände der Wert, bevor man ihn gelesen hat. Senkrecht scrollt die Seite
weiter, waagerechtes Wischen gehört dem Diagramm.

## Abgleich mit Dropbox

### Einmal einrichten

1. Auf **dropbox.com/developers/apps** eine App anlegen: *Scoped access*,
   *App folder*, Name beliebig. Die App bekommt dadurch einen eigenen Ordner und
   sieht nichts sonst in deiner Dropbox.
2. Reiter *Permissions*: `files.content.read` und `files.content.write` ankreuzen
   und speichern. **Vor** dem nächsten Schritt – nachträglich geänderte Rechte
   greifen erst nach einer neuen Anmeldung.
3. Reiter *Settings*: den **App key** kopieren und bei *Redirect URIs* die Adresse
   eintragen, die die App dir im Einrichtungsdialog anzeigt.
4. In der App „Mit Dropbox verbinden", App key einfügen, anmelden.

Der App key ist nicht geheim – er benennt nur die App. Die Anmeldung läuft über
PKCE, es gibt also kein App-Geheimnis im Code. Der dauerhafte Zugang liegt
ausschließlich auf deinem Gerät.

Weil die Web-App auf dem Home-Bildschirm ihren **eigenen Speicher** hat, musst du
dich dort einmal gesondert anmelden, auch wenn du es in Safari schon getan hast.

### Wann abgeglichen wird

Beim Start, bei der Rückkehr zur App, wenn das Netz wiederkommt und rund acht
Sekunden nach der letzten Änderung. Der Zustand steht rechts oben in der Kopfzeile
und lässt sich dort anklicken, um sofort abzugleichen.

### Wenn sich zwei Stände widersprechen

Die App führt widersprüchliche Stände **nicht** automatisch zusammen. Einen
JSON-Baum zweier Geräte zu verschmelzen hieße raten, und bei Steuerdaten ist das
die falsche Art von Bequemlichkeit. Stattdessen erscheint ein Dialog mit beiden
Fassungen – Änderungsdatum, Gerät, Anzahl Objekte und Buchungen – und du
entscheidest. **Die unterlegene Fassung bleibt als Sicherung erhalten** und ist
unter *Einstellungen → Speicherung* wiederherstellbar.

Technisch stützt sich das auf zwei Zahlen: einen Zähler in der Datei, der mit
jeder Änderung steigt, und Dropbox' eigene Kennung des Dateistands (`rev`).
Hochgeladen wird nur, wenn die Datei drüben noch die erwartete `rev` hat – sonst
meldet Dropbox einen Konflikt, statt den fremden Stand zu überschreiben. Uhrzeiten
werden bewusst nicht verglichen; die laufen auf zwei Geräten ohnehin auseinander.

### Grenzen des Abgleichs

- **Bilder und Dokumente werden nur ergänzt, nie gelöscht.** Ob eine Datei auf
  einem Gerät fehlt, weil sie gelöscht wurde oder weil dieses Gerät sie noch nie
  geholt hat, lässt sich nicht unterscheiden – und falsch geraten wäre das Löschen
  der teurere Fehler. Entfernte Fotos bleiben darum in Dropbox liegen. Sie kosten
  Platz, aber nichts geht verloren.
- **Kein Mehrbenutzerbetrieb.** Ein Dropbox-Konto, ein Portfolio, mehrere Geräte
  nacheinander. Zwei Leute, die gleichzeitig arbeiten, erzeugen nur Konflikte.
- **Deine Daten liegen bei Dropbox.** Das ist der Preis für den Zugriff von
  überall ohne eigenen Server. Wer das nicht will, bleibt beim Ordner auf dem
  Rechner.
- **Auf dem iPad noch nicht erprobt:** Ob die Anmeldung aus einer Web-App auf dem
  Home-Bildschirm sauber zurückspringt, hängt an iOS und ließ sich hier nicht
  prüfen. Das ist der erste Punkt, den du auf dem Gerät selbst testen solltest.

## Stand der Entwicklung

| Phase | Inhalt | Status |
|-------|--------|--------|
| 1 | Grundgerüst, Ordner-Speicherung, Autosave, Navigation, Einstellungen | fertig |
| 2 | Objekte anlegen/bearbeiten/löschen, Bilder, Objektliste | fertig |
| 3 | Einheiten & Mietverträge | fertig |
| 4 | Finanzierungen & Tilgungsplan | fertig |
| 5 | Dashboard, Kennzahlen, Cashflow, Steuern | fertig |
| 6 | Forecast mit Szenarien | fertig |
| 7 | Dokumente, Änderungsprotokoll, Wiederherstellung | fertig |
| 8 | Verzögerter Tilgungsstart je Darlehen | fertig |
| 9 | Buchhaltung: freie Buchungen, Fahrtenbuch, Nebenkostenabrechnung, Anlage-V-Export | fertig |
| 10 | Austauschbare Speicherschicht, Gerätespeicher fürs iPad, Web-App-Hülle | fertig |
| 11 | Dropbox-Abgleich mit Offline-Betrieb | fertig |
| 12 | Touch-Bedienung fürs iPad | fertig |

## Aufbau des Codes

```
Start.bat            Starter
server.js            Mini-Webserver (localhost, optional im Heimnetz)
index.html           Grundgerüst
manifest.webmanifest Web-App-Hülle für „Zum Home-Bildschirm"
css/app.css          Design-System
js/util.js           Formatierung, DOM-Helfer, Toasts, Dialoge
js/db.js             IndexedDB: gemerkte Ablage und Gerätespeicher
sw.js                Service Worker: hält die Programmdateien für offline vor
js/storage.js        Autosave, Backups, Bilder – entscheidet wann, nicht wohin
js/speicher/dateiablage.js  IndexedDB-Dateiablage, Grundlage zweier Ablagen
js/speicher/ordner.js       Ablage im Ordner (File System Access API)
js/speicher/lokal.js        Ablage auf dem Gerät (IndexedDB)
js/speicher/dropbox.js      Ablage Dropbox: lokal zuerst, Abgleich daneben
js/speicher/dropboxApi.js   Dropbox-Anmeldung (PKCE) und REST-Aufrufe
js/abgleich.js       wann abgeglichen wird, Konfliktdialog, Statusanzeige
js/store.js          Datenmodell, Zustand, Berechnungen
js/finanzmathematik.js  Tilgungsrechnung (rein, ohne Oberfläche)
js/kennzahlen.js     Cashflow, Renditen, Steuern (rein, ohne Oberfläche)
js/zahlungen.js      Zahlungsebene: abgeleitete Zeilen + freie Buchungen/Fahrten (rein)
js/buchhaltung.js    Hauptbuch, Nebenkostenabrechnung, Erhaltungs-Ampel, Anlage V (rein)
js/forecast.js       Prognose-Engine mit Szenarien (rein, ohne Oberfläche)
js/diagramm.js       SVG-Diagramme ohne Fremdbibliothek
js/felder.js         wiederverwendbare Formularfelder
js/main.js           Startbildschirm, Navigation, Router
js/views/            die einzelnen Ansichten
excel/               eigenständige Node-Skripte, die die Tabellenfassung
                     ImmoPortfolio-2026.xlsx erzeugen (greifen nicht auf js/ zu)
```

## Bedienung

**Objekt anlegen:** Objekte → „+ Objekt" → Eckdaten eingeben → du landest direkt im Objekt.
Alles wird beim Verlassen eines Feldes automatisch gespeichert, es gibt keinen Speichern-Button.

**Kaufnebenkosten:** jede Position über die Schalter `%` / `€` umstellbar. Beim Wechsel wird
der Wert umgerechnet, der Euro-Betrag bleibt gleich. Über „+ Weitere Position" lassen sich
eigene Posten ergänzen.

**Eigenprovision:** eine nachträgliche Kaufpreisreduktion, etwa eine an dich
zurückfließende Provision. Sie mindert die Gesamtinvestition und damit die AfA-Bemessungsgrundlage
und das eingesetzte Eigenkapital – die Kaufnebenkosten bleiben unangetastet, denn
Grunderwerbsteuer, Notar und Makler wurden auf den beurkundeten Kaufpreis festgesetzt.

**Bilder:** ins gestrichelte Feld ziehen oder hineinklicken. Der Stern setzt das Titelbild,
ein Klick aufs Bild zeigt es groß.

**Einheiten:** nur bei Objekten mit dem Schalter „Objekt hat mehrere Einheiten". Bei allen
anderen legt die App im Hintergrund automatisch eine Einheit an, an der die Mietverträge
hängen – davon merkst du nichts.

**Mietanpassungen und Staffelmieten** sind dasselbe: eine weitere Zeile in den
Mietkonditionen mit Datum „gültig ab". Liegt das Datum in der Zukunft, gilt sie als geplant
und greift automatisch, sobald der Termin erreicht ist. Der Vertragsstatus (künftig / aktiv /
beendet) wird immer aus Beginn, Befristung und Kündigung berechnet, nie von Hand gesetzt.

**Tilgungsstart.** Neben der Auszahlung lässt sich ein **Tilgungsstart** erfassen. Bis dahin
fließen nur die Zinsen – die Rate ist in dieser Zeit um den Tilgungsanteil kleiner, was den
Cashflow der Anlaufmonate spürbar entlastet. Im Monat des Tilgungsstarts wird die Rate als
Annuität auf die dann noch offene Restschuld neu bestimmt und läuft ab da normal weiter.

Das Feld ist leer voreingestellt (Tilgung ab der ersten Rate) und gilt für jede Darlehensart,
nicht nur für KfW-Darlehen. Maßgeblich ist der Monat: ein Datum mitten im Monat heißt „ab
diesem Monat wird getilgt". Bei endfälligen Darlehen und bei Tilgungsersatz bleibt es ohne
Wirkung, weil dort ohnehin nicht getilgt wird. Die Restschuld bleibt während der
tilgungsfreien Zeit unverändert, die Laufzeit verlängert sich entsprechend, und in Summe
fallen mehr Zinsen an – die Darlehensansicht beziffert beides.

**Tilgungsrechnung:** Die erste Rate fällt im Monat nach der Auszahlung an, Zinsen werden
monatlich auf die Restschuld berechnet (nachschüssige Annuität). Nach Ablauf der Zinsbindung
rechnet die App mit dem Anschlusszins weiter und **behält die bisherige Monatsrate bei** –
der Tilgungsanteil verändert sich entsprechend. Nur wenn die Rate die Zinsen nicht mehr decken
unter **1 % der Restschuld**, wird die Rate auf Zins + 1 % Tilgung angehoben. Ohne diese
Mindesttilgung käme die Rückführung bei einem kräftigen Zinssprung fast zum Erliegen –
eine Bank würde das nicht mittragen.

**Tilgungsersatz.** Jedes Darlehen hat unter den Konditionen den Schalter
*„Tilgungsersatz statt Tilgung"*. Ist er gesetzt, wird das Darlehen nicht getilgt – die
Restschuld und damit die Zinslast bleiben über die gesamte Laufzeit konstant. Stattdessen
fließt ein fester Prozentsatz des Darlehensbetrags monatlich auf ein verzinstes Konto.
Erst mit dem Haken erscheinen die beiden Felder *Tilgungsersatz p. a.* und *Verzinsung des
Guthabens*, dazu die daraus errechnete Monatsrate. Die Darlehensart bleibt davon unberührt –
eine Annuität mit Tilgungsersatz ist genauso möglich wie ein endfälliges Darlehen.

Die Einzahlungen mindern den Cashflow wie eine Tilgung, sind aber ebenso wenig steuerlich
abzugsfähig. Das Guthaben zählt nicht zur Restschuld, sondern wird getrennt ausgewiesen –
**eingezahlt (ohne Verzinsung) und Guthaben (mit Verzinsung)** stehen beim Objekt und im
Dashboard nebeneinander, im Darlehen zusätzlich mit dem Deckungsgrad der Restschuld.

**Cashflow-Rechnung.** Oben rechts schaltest du zwischen *vor* und *nach Steuern* um; die
Auswahl gilt für alle Ansichten und bleibt gespeichert. Es gilt:

```
Kaltmiete
− nicht umlagefähige Bewirtschaftungskosten
− Erhaltungsaufwand, Fahrtkosten, sonstige Werbungskosten (frei erfasst)
− Zinsen
− Tilgung (und Sondertilgung)
= Cashflow vor Steuern

Kaltmiete + Umlagen − Bewirtschaftung − umlagefähige Kosten
  − Erhaltung/Fahrten/Sonstiges − Zinsen − AfA  = Einkünfte aus Vermietung
Einkünfte × effektiver Steuersatz                = Steuer (negativ = Erstattung)
Cashflow vor Steuern − Steuer                    = Cashflow nach Steuern
```

Wichtig dabei: **Die Tilgung mindert den Cashflow, aber nicht die Steuer** – sie ist keine
Werbungskostenposition, ebenso wenig eine Kaution, die dem Mieter gehört. Die **AfA mindert
die Steuer, aber nicht den Cashflow** – sie ist keine Zahlung. Genau daraus entsteht bei
fremdfinanzierten Objekten der typische Fall „negativer Cashflow vor Steuern, deutlich
besser nach Steuern".

**Umlagen und umlagefähige Kosten bleiben im Cashflow außen vor** – dafür gibt es den
separaten **Nebenkosten-Saldo** (vereinnahmte Vorauszahlung minus umlagefähige Kosten,
Kachel in der Objektansicht). Steuerlich zählen jedoch beide Seiten: die Vorauszahlung als
Einnahme, die umlagefähigen Kosten als Werbungskosten. Bei Vollvermietung gleicht sich das
nahezu aus – bei **Leerstand** nicht: Dann trägt der Vermieter die umlagefähigen Kosten
selbst und kann sie absetzen, was die App erst seit der Buchhaltung korrekt abbildet. Vom
Hausgeld wird für den Cashflow nach wie vor nur der nicht umlagefähige Teil angesetzt
(Hausgeld − umlagefähig); der Betrag steht als eigene Zeile in den laufenden Kosten.
Soli und Kirchensteuer werden auf die Einkommensteuer aufgeschlagen, nicht auf das Einkommen.

**Geflossen oder gerechnet.** Zwei Betrachtungen stehen nebeneinander, und sie beantworten
verschiedene Fragen:

- Die **Jahreswerte** – Cashflow-Spalten, Objektansicht, Forecast – sind immer ganze
  Kalenderjahre. Im laufenden Jahr stecken darin auch die Monate, die noch kommen. Sie
  beantworten: *Was bringt das Jahr insgesamt?*
- Die Kachel **Geflossener Cashflow** und die Zeile *Geflossene Cashflows* in der Objektansicht
  zählen dagegen nur bis zum laufenden Monat. Sie beantworten: *Was ist bisher wirklich
  geflossen?* Steht der Kauf noch bevor, steht dort null mit dem Vermerk „noch nichts geflossen".

Zum Jahresende laufen beide Zahlen wieder zusammen. Die Steuer wird in der Geflossen-Rechnung
zeitanteilig angesetzt, obwohl sie tatsächlich erst mit der Veranlagung fließt.

**Alles ist ein Kalenderjahr.** Miete, Zinsen, Tilgung und AfA werden für das jeweilige Jahr
monatsgenau angesetzt. Im Anschaffungsjahr sind das entsprechend weniger als zwölf Monate –
das Dashboard zeigt deshalb **laufendes Jahr, Folgejahr und den Zehnjahresschnitt
nebeneinander**, jeweils vor und nach Steuern. Für die laufende Belastung ist das Folgejahr
die aussagekräftige Zahl. Renditen und der Kaufpreisfaktor rechnen dagegen immer mit der
laufenden Jahresmiete (12 × aktuelle Monatsmiete), damit ein Rumpfjahr sie nicht verzerrt.

**Abschreibung.** Der Grundstücksanteil wird auf die **Anschaffungskosten inkl.
Nebenkosten** angewendet; die Kaufnebenkosten werden damit im selben Verhältnis wie der
Kaufpreis auf Grundstück und Gebäude aufgeteilt. Liegt ein Kaufpreisaufteilungsgutachten
vor, das den Gebäudewert als festen Betrag statt als Prozentsatz ausweist, trägst du ihn
stattdessen unter „Gebäudeanteil, manuell" ein – er ersetzt dann den Grundstücksanteil.
Im Anschaffungsjahr wird die AfA ab dem Kaufmonat zeitanteilig angesetzt. Der AfA-Satz ist
frei eingebbar – für ein Restnutzungsdauer-Gutachten trägst du z. B. 3,226 % ein (31 Jahre).

**Forecast.** Die Annahmen stehen direkt über den Diagrammen und werden im Portfolio
gespeichert – jede Änderung rechnet sofort neu. Modell je Jahr:

- **Miete** wird Vertrag für Vertrag fortgeschrieben. Grundlage ist immer die zuletzt
  vereinbarte Kondition; ab dem Jahr, in dem sie gilt – frühestens ab dem Startjahr –,
  wächst die Miete mit dem Anpassungssatz. Eine vereinbarte Staffel setzt die Basis also neu
  und die Fortschreibung läuft von dort weiter. **Negative Sätze senken die Miete.**
  Steht im Mietvertrag eine Indexmiete mit angenommener Anpassung, gilt dieser Satz für
  diesen Vertrag statt der Portfolio-Vorgabe. Anschließend Abzug der Leerstandsquote.
- **Kosten** werden mit der Inflation fortgeschrieben. Instandhaltung: der am Objekt
  erfasste Betrag, sonst der Prozentsatz vom Kaufpreis aus den Annahmen. Das Feld am Objekt
  muss dafür **leer** sein – eine ausdrücklich eingetragene 0 wird respektiert und setzt
  keine Rücklage an. In der Objektansicht steht am Feld, welcher der beiden Fälle greift und
  mit welchem Betrag der Forecast rechnet.
- **Finanzierung** kommt aus dem Tilgungsplan, nach Ablauf der Zinsbindung mit dem
  Anschlusszins des jeweiligen Szenarios.
- **AfA** endet, sobald das Gebäude abgeschrieben ist (bei 2 % nach 50 Jahren ab Kauf).
- **Verkauf** ist optional. Innerhalb der zehnjährigen Spekulationsfrist wird der Gewinn
  versteuert; Bemessungsgrundlage ist der Buchwert nach bereits geltend gemachter AfA.

Die Randszenarien leiten sich aus den Basisannahmen ab: *pessimistisch* −1 Punkt
Mietsteigerung, −2 Wertsteigerung, +3 Leerstand, +1,5 Anschlusszins, +0,5 Instandhaltung;
*optimistisch* entsprechend in die Gegenrichtung. Die genauen Abweichungen stehen unter den
Eingabefeldern.

**Miet- und Wertsteigerung dürfen dabei negativ werden** – ein fallender Markt ist genau
das, was ein pessimistisches Szenario abbilden soll. Leerstand, Anschlusszins und
Instandhaltung bleiben dagegen bei null gedeckelt, weil negative Werte dort sachlich
keinen Sinn ergeben.

**Buchhaltung** ist das Hauptbuch der App: abgeleitete Zeilen (Miete, Nebenkosten, Zins,
Tilgung …) und frei erfasste Buchungen und Fahrten in einer Tabelle, filterbar nach Jahr,
Objekt, Wohnung, Kategorie und Herkunft.

Abgeleitete Zeilen entstehen wie bisher aus Mietverträgen, Kostenfeldern und Tilgungsplänen
und lassen sich **einzeln korrigieren**: anderer Betrag eintragen oder mit ∅ als ausgefallen
markieren. Gespeichert wird nur die Abweichung, nie die ganze Zahlungsreihe. Korrekturen
fließen in Cashflow, Steuer, kumulierte Summen und das Dashboard des betroffenen Jahres ein.
Zwei Grenzen: Der **Tilgungsplan** bleibt unberührt – eine gestrichene Tilgungsrate
verbessert den Cashflow, ändert aber nicht die rechnerische Restschuld. Und der **Forecast**
rechnet weiter mit den Stammdaten, er ist ein Modell, keine Ist-Rechnung.

**Freie Buchungen** (+ Buchung) sind eigene Geschäftsvorfälle mit Datum, Kategorie, Betrag,
Bezeichnung und Notiz – Grundsteuer, Versicherung, Handwerkerrechnung, Steuerberatung und
mehr. Das Datum ist der Tag des tatsächlichen Zahlungsflusses (§ 11 EStG), nicht ein
Kalendermonat wie bei den Korrekturen. Sie erscheinen sowohl in der Buchhaltung als auch,
fürs laufende Jahr, direkt in der Objektansicht.

**Erhaltungsaufwand** ist eine eigene Kategorie mit zwei steuerlichen Besonderheiten:

- **15-%-Grenze** (§ 6 Abs. 1 Nr. 1a EStG): Erhaltungsaufwand, der binnen drei Jahren ab
  Kauf in Summe 15 % der Gebäude-Anschaffungskosten übersteigt, gilt rückwirkend
  vollständig als Herstellungskosten – abzuschreiben statt sofort abziehbar. Die
  Objektansicht führt dazu eine Ampel: gelb ab 80 % der Grenze, rot darüber. Das ist ein
  **Hinweis, keine Reklassifizierung** – die App bucht nichts von sich aus um.
- **§ 82b EStDV:** Größerer Erhaltungsaufwand lässt sich wahlweise auf 2–5 Jahre verteilen.
  Der Cashflow zeigt den vollen Betrag im Zahlungsjahr, die Steuerwirkung verteilt sich
  gleichmäßig auf die gewählten Jahre.
- **Aktivieren** statt verteilen erhöht stattdessen direkt die AfA-Bemessungsgrundlage –
  wie eine aktivierte Modernisierung. Verteilen und Aktivieren schließen sich gegenseitig aus.

**Fahrten** (+ Fahrt) werden aus Datum, Kilometern und Anlass erfasst; der Betrag wird
gerechnet, nicht eingetragen. Zwei Modi unter *Einstellungen*:

- **Reisekosten** (Vorgabe): 0,30 € je gefahrenem Kilometer, hin und zurück – der Regelfall
  laut BFH-Urteil IX R 18/15.
- **Entfernungspauschale**: 0,38 € je einfachem Kilometer (ab 1.1.2026), für den
  Ausnahmefall, dass ein Objekt zur regelmäßigen Tätigkeitsstätte wird – etwa bei sehr
  häufigen Fahrten.

**Nebenkostenabrechnung.** Für Objekte mit erfassten Einheiten zeigt die Objektansicht je
Einheit und laufendem Jahr Vorauszahlung, anteilige umlagefähige Kosten (nach Wohnfläche
verteilt) und das Ergebnis als Nachzahlung oder Erstattung. Eine Näherung fürs laufende Jahr,
kein Ersatz für die formelle, rechtssichere Abrechnung.

**Steuerjahr.** Eigener Menüpunkt mit einer Aufstellung der Einnahmen und Werbungskosten in
der Gliederung der Anlage V – je Objekt und fürs ganze Portfolio, exportierbar als CSV.
**Zuarbeit fürs Finanzamt oder den Steuerberater, keine Steuerberatung.**

**Grenzen der Buchhaltung**, bewusst gezogen:

- **Keine Umsatzsteuer, keine Vorsteuer.** Alle Beträge sind Bruttobeträge. Das deckt die
  Wohnraumvermietung vollständig ab (§ 4 Nr. 12a UStG steuerfrei); bei einer Gewerbeeinheit
  mit Umsatzsteuer-Option (§ 9 UStG) rechnest du außerhalb der App nach.
- **Keine doppelte Buchführung, kein Kontenrahmen.** Eine Überschussrechnung für die
  Anlage V, kein Journal mit Soll und Haben.
- **Keine Bankanbindung, kein Kontoimport.** Jede Buchung wird von Hand erfasst.
- **Die 10-Tage-Regel des § 11 EStG** (regelmäßig wiederkehrende Zahlungen kurz vor oder
  nach dem Jahreswechsel gelten für das Jahr, zu dem sie wirtschaftlich gehören) wendet die
  App **nicht automatisch** an – gebucht wird nach dem eingetragenen Datum.

**Dokumente** hängst du per Drag & Drop an ein Objekt, einen Mietvertrag oder ein Darlehen.
Sie landen unverändert im Unterordner `dokumente`, die Kategorie wird aus dem Dateinamen
geraten und ist änderbar. Wird ein Objekt gelöscht, verschwinden auch die Dokumente seiner
Verträge und Darlehen mitsamt Dateien.

**Änderungsprotokoll.** Jede Änderung in einem Formularfeld wird mit Zeitpunkt, Feldname,
altem und neuem Wert festgehalten – sichtbar unten in jeder Detailansicht, vollständig unter
*Einstellungen*. Tabellenzeilen wie Mietkonditionen, Verkehrswerte und Sondertilgungen
protokollieren nicht mit, sie führen ihre Historie ohnehin selbst.

**Wiederherstellung.** Unter *Einstellungen → Speicherung* steht jede Sicherung mit Datum und
Uhrzeit. Vor dem Wiederherstellen wird automatisch der aktuelle Stand gesichert, der Schritt
ist also umkehrbar. Bilder und Dokumente bleiben dabei unangetastet.

Gesichert wird einmal je Tag, und zwar der Stand **vor** der ersten Änderung des Tages. Löschst
du also morgens als erste Handlung ein Objekt, liegt in `backups` noch der Stand von gestern
Abend – genau darauf verlassen sich die Warnhinweise in den Löschdialogen.
