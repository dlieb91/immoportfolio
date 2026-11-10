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

Für den richtigen Betrieb liegen die Dateien auf GitHub Pages:

> **https://dlieb91.github.io/immoportfolio/**

HTTPS ist dabei keine Förmlichkeit: Ohne sicheren Kontext gibt es weder
Offline-Betrieb noch den Dropbox-Abgleich – der Browser gibt `crypto.subtle` und
Service Worker nur dort frei.

Auf dem iPad diese Adresse in Safari öffnen und über *Teilen → Zum
Home-Bildschirm* ablegen. Erst damit ist der Speicher dauerhaft (siehe oben) und
die App startet im Vollbild.

Im Vollbild reicht die App bis unter die **Statusleiste** des iPads (Uhrzeit, WLAN,
Akku). Kopfzeile, Seitenleiste und die Brief-Seite halten diesen Streifen deshalb
frei und legen einen dunklen Hintergrund darunter – iOS zeichnet die Symbole weiß,
auf der hellen Kopfzeile des hellen Themas wären sie sonst kaum zu sehen. Am
Rechner und im normalen Browserfenster ist der Streifen null hoch, dort ändert sich
nichts. Die Höhe der App folgt der sichtbaren Fläche (`100dvh`), damit Safaris
Symbolleiste im Browser den unteren Rand nicht verdeckt.

### Eine neue Fassung veröffentlichen

```
git add -A
git commit -m "Was sich geändert hat"
git push
```

GitHub Pages baut danach selbsttätig, meist binnen einer Minute. Die App holt
sich die neuen Dateien beim nächsten Start – der Service Worker fragt immer
zuerst das Netz und greift nur ohne Verbindung auf seinen Vorrat zurück.

**Was nicht ins Repository gehört** und durch `.gitignore` gesperrt ist: deine
`portfolio.json`, Bilder, Dokumente, Sicherungen und die lokalen
Claude-Einstellungen. Das Repository ist öffentlich; der Code enthält keine
Geheimnisse, denn die Dropbox-Anmeldung über PKCE kommt ohne App-Secret aus.

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

## Auf dem Handy benutzen

Dieselbe Adresse, derselbe Weg über *Teilen → Zum Home-Bildschirm*. Unter 600 px Breite stellt
die App auf Daumenbedienung um; darüber – iPad, Rechner – bleibt alles, wie es ist.

- **Leiste unten** mit Start, Objekte, Buchhaltung und Forecast; **Mehr** öffnet das Menü mit
  allen übrigen Ansichten und dem Umschalter für Hell und Dunkel.
- **Kopfzeile:** Der Titel steht immer lesbar da. Der Steuerumschalter heißt kurz *vor / nach*,
  der Speicherstatus ist nur noch der Punkt daneben (grün = gespeichert).
- **Einklappbare Karten:** Ein Tipp auf den Kartenkopf klappt ein und aus, die App merkt sich
  das je Ansicht. Eingabe- und Detailkarten (Stammdaten, Laufende Kosten, Tilgungsplan, Anhang
  der Anlage V, Annahmen im Forecast …) sind anfangs zu, Kennzahlen und Ergebnisse offen.
  Gedruckt wird immer alles.
- **Buchhaltung:** Die Filter liegen hinter dem Knopf *Filter*; er nennt, wie viele gesetzt
  sind. Die Buchungen sind nach Monaten gruppiert, offen ist zunächst der laufende. Eine Zeile
  zeigt Text und Betrag – **antippen** öffnet ein Fenster von unten mit Betrag, Zahlungseingang
  (nicht verfolgt / offen / eingegangen), Notiz, *Ausgefallen* und *Löschen*. Eine neue Buchung
  oder Fahrt öffnet ihr Fenster gleich mit.
- **Lange Hinweise** sind auf drei Zeilen gekürzt, *mehr* zeigt den Rest. Der Anfang bleibt
  stehen – dort steht, was man nicht übersehen soll.
- Breite Tabellen scrollen in sich, statt die Seite zu verbreitern; alle Knöpfe und Felder
  sind mindestens 44 px hoch.

Wer das Gerät dreht oder das Fenster zieht, bekommt beim Überschreiten der Grenze sofort die
passende Darstellung.

## Drucken

Objektblatt, Anlage-V-Aufstellung und Forecast tragen oben rechts einen Knopf **Drucken**.
Er öffnet den Druckdialog des Browsers – von dort geht es aufs Papier oder über *Als PDF
sichern* in eine Datei.

Gedruckt wird **die Ansicht, die ohnehin auf dem Schirm steht**. Es gibt keine zweite
Darstellung, die irgendwann von der ersten abweichen könnte; `css/druck.css` blendet nur
aus, was auf Papier nichts beiträgt: Seitenleiste, Kopfzeile, Knöpfe, Filter,
Navigationslinks, leere Ablageflächen für Dateien und die Platzhalter in Eingabefeldern.
Beim Objektblatt bleiben zusätzlich Dokumentenliste und Änderungsprotokoll weg – auf einem
Blatt für Bank oder Steuerberater tragen sie nichts bei und kosten nur Seiten.

**Was bleibt, sind die Hinweise und Fußnoten.** Gerade die steuerlichen Vorbehalte gehören
auf das Papier, das beim Steuerberater landet.

Jeder Ausdruck trägt oben einen Briefkopf mit Marke, Titel, Portfolioname und Datum. Die
Anlage-V-Aufstellung beginnt **je Objekt auf einer neuen Seite**, weil beim Finanzamt je
Objekt eine eigene Anlage V abgegeben wird. Der **Forecast druckt im Querformat** – eine
Jahrestabelle mit vierzehn Spalten passt im Hochformat nicht auf das Blatt.

Dass die App dunkel dargestellt wird, spielt keine Rolle: Für den Druck werden die
Farbvariablen auf Papierwerte gesetzt, und Diagramme ziehen automatisch mit, weil sie
dieselben Variablen benutzen.

## Wenn eine Neuerung nicht ankommt

Die App hält ihre Programmdateien für den Offline-Betrieb vor. Browser – auf dem
iPad besonders hartnäckig – können deshalb eine alte Fassung weiterbenutzen, obwohl
der Server längst die neue ausliefert. Daran erkennt man es: Die Korrektur ist
veröffentlicht, aber auf dem Gerät ändert sich nichts.

Der Regelfall ist, dass sich das von selbst erledigt: Die App fragt für jede
Programmdatei ausdrücklich am Netz nach und lädt einmal neu, sobald ein neuer
Stand übernommen wurde. Bleibt doch etwas hängen, hilft **Einstellungen →
Programm erneuern**: Das räumt den Zwischenspeicher, meldet den Service Worker ab
und lädt die Seite frisch. **Deine Daten bleiben unberührt** – sie liegen in der
Datei beziehungsweise im Gerätespeicher, nicht im Zwischenspeicher der App.

## Abgleich mit Dropbox

### Einmal einrichten

1. Auf **dropbox.com/developers/apps** eine App anlegen: *Scoped access*,
   *App folder*, Name beliebig. Die App bekommt dadurch einen eigenen Ordner und
   sieht nichts sonst in deiner Dropbox.
2. Reiter *Permissions*: `files.content.read` und `files.content.write` ankreuzen
   und speichern. **Vor** dem nächsten Schritt – nachträglich geänderte Rechte
   greifen erst nach einer neuen Anmeldung.
3. Reiter *Settings*: den **App key** kopieren und bei *Redirect URIs* genau diese
   Adresse eintragen (auf das Zeichen genau, mit Schrägstrich am Ende):

   ```
   https://dlieb91.github.io/immoportfolio/
   ```

   Die App zeigt dieselbe Adresse im Einrichtungsdialog zum Kopieren an.
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
| 13 | Spekulationsfrist, offene § 82b-Verteilungen, Soll/Ist bei den Mieten | fertig |
| 14 | Mieterhöhungsspielraum nach § 558 BGB | fertig |
| 15 | Staffel- und Indexmiete im Vertrag, mit Erinnerung an den Mieter | fertig |
| 16 | Druckansicht für Objektblatt, Anlage V und Forecast | fertig |
| 17 | Anhang zur Anlage V: Herleitung der Werbungskosten | fertig |
| 18 | Erhaltungsrücklage steuerlich neutral (BFH IX R 19/24) | fertig |
| 19 | 15-%-Grenze rechnet mit: Sanierung sofort absetzen oder aktivieren | fertig |
| 20 | Programmdateien erneuern sich zuverlässig (Zwischenspeicher) | fertig |
| 21 | Anschlussfinanzierung: Varianten und Forward-Schwelle nach Ablauf der Zinsbindung | fertig |
| 22 | Liquiditätsvorschau über zwölf Monate | fertig |
| 23 | Schreiben an den Mieter: Verlangen (§ 558), Indexerklärung (§ 557b), Ankündigung der Staffel | fertig |
| 24 | iPad im Vollbild: Kopfzeile nicht mehr unter der Statusleiste | fertig |
| 25 | Handy: Leiste unten, einklappbare Karten, Buchhaltung mit Fenster von unten | fertig |
| 26 | Eingesetztes Eigenkapital einschließlich Sanierung | fertig |
| 27 | Nebenkosten: Positionen mit Fälligkeit, Monatsübersicht, umlagefähig und Rücklage | fertig |
| 28 | Nebenkosten: Gültigkeit ab/bis, Abrechnung buchen, Frist, Vorauszahlung anpassen, Rücklage-Entnahme | fertig |
| 29 | Aufteilung des Kaufpreises in Gebäude und Grundstück, als Betrag oder in % | fertig |
| 30 | Anschaffungskosten: Grundschuld sofort abziehbar, Inventar mit eigener AfA, Rücklagenanteil ohne AfA | fertig |

## Aufbau des Codes

```
Start.bat            Starter
server.js            Mini-Webserver (localhost, optional im Heimnetz)
index.html           Grundgerüst
manifest.webmanifest Web-App-Hülle für „Zum Home-Bildschirm"
css/app.css          Design-System
css/druck.css        Druckbogen, nur beim Drucken geladen
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
js/mieterhoehung.js  Spielraum nach § 558 BGB (rein, ohne Oberfläche)
js/schreiben.js      Textbausteine der Mieterhöhungs-Schreiben (rein, ohne Oberfläche)
js/store.js          Datenmodell, Zustand, Berechnungen
js/finanzmathematik.js  Tilgungsrechnung (rein, ohne Oberfläche)
js/liquiditaet.js    Liquiditätsvorschau über zwölf Monate (rein, ohne Oberfläche)
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

**Energieeffizienzklasse:** in den Stammdaten als Auswahl A+ bis H laut Energieausweis.
Sie ist eine reine Angabe, erscheint als Kennzeichen in der Objektliste und rechnet nirgends mit.

**Kaufnebenkosten:** jede Position über die Schalter `%` / `€` umstellbar. Beim Wechsel wird
der Wert umgerechnet, der Euro-Betrag bleibt gleich. Über „+ Weitere Position" lassen sich
eigene Posten ergänzen.

**Eigenprovision:** eine nachträgliche Kaufpreisreduktion, etwa eine an dich
zurückfließende Provision. Sie mindert die Gesamtinvestition und damit die AfA-Bemessungsgrundlage
und das eingesetzte Eigenkapital – die Kaufnebenkosten bleiben unangetastet, denn
Grunderwerbsteuer, Notar und Makler wurden auf den beurkundeten Kaufpreis festgesetzt.

**Eingesetztes Eigenkapital** – auf Objekt- und Portfolioebene, im Forecast und in der
Kapitalbindung dieselbe Zahl:

> Kaufpreis + Nebenkosten (abzüglich Eigenprovision) **+ Sanierung** − Darlehen

*Sanierung* sind alle Maßnahmen der Karte *Modernisierung & Sanierung*, gleich ob sie
steuerlich sofort abgesetzt oder über die AfA abgeschrieben werden – das Geld ist eingesetzt,
egal was das Finanzamt daraus macht. **Erhaltungs-Buchungen zählen nicht mit:** Sie sind
Zahlungen in der Buchhaltung und mindern bereits den geflossenen Cashflow; hier noch einmal
gezählt, stünden sie doppelt da. Wer eine größere Sanierung aus eigener Tasche bezahlt, trägt
sie deshalb in der Sanierungskarte ein. Die Gesamtinvestition bleibt Kaufpreis plus
Nebenkosten, damit Kaufpreisfaktor und Mietrenditen weiter auf den Kauf bezogen sind; die
Eigenkapitalrenditen rechnen auf das eingesetzte Eigenkapital einschließlich Sanierung.

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

**Anschlussfinanzierung.** Solange die Zinsbindung noch läuft, rechnet die Darlehensansicht
darunter durch, was danach käme. Grundlage ist die **Restschuld zum Bindungsende**; jede
Variante ist eine neue Finanzierung über genau diesen Betrag und läuft durch denselben
Tilgungsplan wie alles andere – es gibt keine zweite Tilgungsformel. Je angenommenem Zins
(die Mitte plus und minus ein Prozentpunkt) stehen drei Gestalten nebeneinander:

| Variante | festgehalten | zeigt |
|---|---|---|
| Heutige Rate bleibt | die Monatsrate | wie sich die Laufzeit verlängert oder verkürzt |
| Tilgung bleibt | der anfängliche Tilgungssatz | wie sich die Rate ändert |
| Volltilgung in *n* Jahren | das Zieljahr | welche Rate dafür nötig ist |

Der **Forward-Vergleich** ist ehrlich gebaut: Wer sich den Zins heute für später sichert, zahlt
einen Aufschlag je Monat Vorlauf, meist ab dem 13. Monat (Vorgabe 0,02 Prozentpunkte, unter
*Einstellungen* änderbar – der Wert deines Angebots gilt, nicht meine Vorgabe). Die App
**empfiehlt nichts**, denn welches Zinsniveau in acht Jahren herrscht, weiß sie so wenig wie
sonst jemand. Sie nennt die Schwelle: Liegt der Marktzins bei Bindungsende über dem
Forward-Zins, hat sich das Forward gelohnt.

Die Annahmen der Karte (Zins, Zieljahre, Marktzins heute) sind Was-wäre-wenn-Werte und werden
**nicht gespeichert**. Nicht enthalten sind Bearbeitungsgebühr, Vorfälligkeitsentschädigung und
Sondertilgungen; der Zins bleibt je Variante bis zur Volltilgung gleich. Bei einem Darlehen
ohne Tilgung (endfällig, Tilgungsersatz) steht die Restschuld bis zum Bindungsende still, und das
Ansparguthaben ist nicht gegengerechnet. Läuft die Bindung binnen zwei Jahren aus, führt der
Hinweis im Dashboard bei genau einem Darlehen direkt zu dieser Karte.

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
selbst und kann sie absetzen, was die App erst seit der Buchhaltung korrekt abbildet. Für den
Cashflow zählen nur die nicht umlagefähigen Positionen der laufenden Kosten und die Rücklage.
Soli und Kirchensteuer werden auf die Einkommensteuer aufgeschlagen, nicht auf das Einkommen.

**Geflossen oder gerechnet.** Zwei Betrachtungen stehen nebeneinander, und sie beantworten
verschiedene Fragen:

- Die **Jahreswerte** – Cashflow-Spalten, Objektansicht, Forecast – sind immer ganze
  Kalenderjahre. Im laufenden Jahr stecken darin auch die Monate, die noch kommen. Sie
  beantworten: *Was bringt das Jahr insgesamt?*
- Die Kachel **Geflossener Cashflow** und die Zeile *Geflossene Cashflows* in der Objektansicht
  zählen dagegen nur **abgeschlossene** Monate. Sie beantworten: *Was ist bisher wirklich
  geflossen?* Steht der Kauf noch bevor, steht dort null mit dem Vermerk „noch nichts geflossen".

Zum Jahresende laufen beide Zahlen wieder zusammen. Die Steuer wird in der Geflossen-Rechnung
getrennt ausgewiesen: Eine Erstattung auf die Verluste dieses Jahres fließt frühestens
mit der Veranlagung im nächsten. Eine Zahl, die „geflossen" heißt, enthält sie deshalb
nicht – sie steht als eigene Kachel *Erwartete Steuerwirkung* daneben.

Ebenso zählt der **laufende Monat nicht mit**: Am 2. November ist der November noch nicht
bezahlt, und ihn voll anzusetzen hieße, Kosten und Abschreibung für einen Monat zu buchen,
der gerade erst begonnen hat.

**Alles ist ein Kalenderjahr.** Miete, Zinsen, Tilgung und AfA werden für das jeweilige Jahr
monatsgenau angesetzt. Im Anschaffungsjahr sind das entsprechend weniger als zwölf Monate –
das Dashboard zeigt deshalb **laufendes Jahr, Folgejahr und den Zehnjahresschnitt
nebeneinander**, jeweils vor und nach Steuern. Für die laufende Belastung ist das Folgejahr
die aussagekräftige Zahl.

**Renditen rechnen auf der Runrate**, nicht auf dem Kalenderjahr: Eigenkapitalrendite,
Bruttomietrendite, Nettorendite, Kaufpreisfaktor und DSCR fragen *„was bringt das, wenn es
läuft?"* und setzen Miete, Kosten und Kapitaldienst alle mit zwölf Monaten an. Ein Rumpfjahr
verzerrt sie damit nicht.

Maßgeblich ist dabei die **vereinbarte** Kaltmiete – die geltende, und solange keine gilt,
die nächste unterschriebene. Das ist bewusst nicht die heute schon fließende: Kosten und
Kapitaldienst stehen in derselben Rechnung mit zwölf Monaten, und davor null Miete zu setzen,
weil der Mieter erst nächsten Monat einzieht, verglich zwei verschiedene Zeitpunkte
miteinander. Vor dem Einzug stünden sonst alle Renditekennzahlen auf null oder weit im Minus,
obwohl die Verträge unterschrieben sind.

Deshalb können **Cashflow und Eigenkapitalrendite verschiedene Vorzeichen haben**: Die
Cashflow-Spalten zeigen ein Kalenderjahr, die Rendite ein volles Betriebsjahr. Im
Anschaffungsjahr liegen die beiden weit auseinander – an den Kacheln steht die jeweilige
Grundlage dran.

**Abschreibung.** Den Kaufpreis teilst du in der Karte *Kauf & Kaufnebenkosten* unter
**Aufteilung des Kaufpreises** auf Gebäude und Grundstück auf – wahlweise als Betrag oder
in Prozent. Ein Feld eingeben genügt, die drei anderen rechnen sich aus (Kaufpreis 100.000 €,
Gebäude 80.000 € → Grundstück 20.000 €, 80 % / 20 %). Was zuletzt eingegeben wurde, ist fest:
Ein Betrag bleibt bei einer späteren Änderung des Kaufpreises gleich, ein Prozentsatz wandert
mit. Der so ermittelte Grundstücksanteil wird auf die **Anschaffungskosten inkl. Nebenkosten**
angewendet; die Kaufnebenkosten werden damit im selben Verhältnis wie der Kaufpreis
aufgeteilt. Die steuerlichen Angaben zeigen den Anteil nur noch an. Weist ein Gutachten den
Gebäudewert dagegen bereits **einschließlich** Nebenkosten aus, trägst du ihn unter
„AfA-Bemessungsgrundlage, manuell" ein – er ersetzt dann die Aufteilung.

Was wohin gehört (H 7.3 EStH, § 9 und § 11 EStG):

| Teil des Kaufs | steuerlich | in der App |
|---|---|---|
| Gebäudeanteil des Kaufpreises + anteilige Grunderwerbsteuer, Notar und Grundbuch für Kauf und Eigentum, Makler | Gebäude-AfA (2 / 2,5 / 3 %) | Spalte *inkl. Nebenkosten*, Zeile Gebäude |
| Grundstücksanteil + anteilige Nebenkosten | keine AfA | Zeile Grundstück |
| Mitgekauftes Inventar, z. B. Einbauküche, im Vertrag gesondert ausgewiesen | eigene AfA, üblich 10 Jahre (BFH IX R 14/15) | Zeile Inventar, Nutzungsdauer wählbar |
| Übernommener Anteil an der Erhaltungsrücklage | keine Anschaffungskosten, keine AfA | Zeile Anteil Erhaltungsrücklage |
| Notar und Grundbuch für die **Grundschuld** (Finanzierung) | sofort abziehbare Werbungskosten im Kaufjahr | Position mit Haken *sofort abziehbar*, Knopf „+ Grundschuld“ |

Die Nebenkosten werden im Verhältnis der Kaufpreisanteile auf Gebäude, Grundstück und
Inventar verteilt; der Rücklagenanteil bekommt keinen Anteil. Das ist eine Vereinfachung: Auf
Inventar fällt streng genommen keine Grunderwerbsteuer an. Sofort abziehbare Positionen zählen
zur Gesamtinvestition und zum Eigenkapital, aber nicht zu den Anschaffungskosten; in der Anlage V
stehen sie im Kaufjahr als *Geldbeschaffungskosten*, die Inventar-AfA als *AfA bewegliche
Wirtschaftsgüter*. Die Excel-Mappe kennt Inventar, Rücklagenanteil und sofort abziehbare
Positionen nicht.
Im Anschaffungsjahr wird die AfA ab dem Kaufmonat zeitanteilig angesetzt. Der AfA-Satz ist
frei eingebbar – für ein Restnutzungsdauer-Gutachten trägst du z. B. 3,226 % ein (31 Jahre).

**Liquidität.** Die erste Karte im Forecast zeigt die **nächsten zwölf Monate**, Monat für
Monat: Einnahmen, laufende Kosten, Kapitaldienst und der Saldo, dazu der kumulierte Stand.
Der Forecast darunter rechnet in Jahresschritten, aber die Klemme entsteht in einem Monat –
wenn die Grundsteuer im Februar fällig ist und erst die Miete im März alles ausgleicht, nützt
ein gutes Jahresergebnis nichts.

Gerechnet wird aus den **erfassten** Mietverträgen, Raten und Buchungen, ohne Annahmen: Das ist
keine Prognose, sondern die vorhandenen Daten nach vorn geschrieben. Weil die App den
Kontostand nicht kennt, beginnt der kumulierte Stand bei null; aussagekräftig ist der
**Tiefpunkt** – so viel Reserve braucht es, um die zwölf Monate ohne Zuschuss von außen zu
überstehen. Der schwächste Monat wird mit seinen größten Ausgaben erklärt, das Dashboard nennt
den Bedarf in einer Zeile.

Zwei Grenzen, die man kennen muss. **Vor Steuern:** Eine Erstattung oder Nachzahlung ist nicht
vorhergesagt. **Fälligkeit aus den Positionen:** Die laufenden Kosten
stehen in dem Monat, den die Position am Objekt angibt – Hausgeld monatlich, die Grundsteuer
etwa vierteljährlich, die Versicherung einmal im Jahr. Eine erhaltene Kaution steht in einer eigenen Zeile *Kaution &
Privat*, denn das Geld gehört dem Mieter.

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
  vollständig als Herstellungskosten – abzuschreiben statt sofort abziehbar. Die App
  **rechnet das mit**, siehe den eigenen Abschnitt weiter unten.
- **§ 82b EStDV:** Größerer Erhaltungsaufwand lässt sich wahlweise auf 2–5 Jahre verteilen.
  Der Cashflow zeigt den vollen Betrag im Zahlungsjahr, die Steuerwirkung verteilt sich
  gleichmäßig auf die gewählten Jahre.
- **Aktivieren** statt verteilen erhöht stattdessen direkt die AfA-Bemessungsgrundlage –
  wie eine aktivierte Modernisierung. Verteilen und Aktivieren schließen sich gegenseitig aus.

### Die 15-%-Grenze: sofort absetzen oder abschreiben

Eine Sanierung in den ersten drei Jahren nach dem Kauf ist der teuerste Zweifelsfall der
Vermietung. Bleibt sie unter der Grenze, mindert sie die Steuer **sofort und in voller
Höhe**. Reißt sie die Grenze, wird sie zu anschaffungsnahen Herstellungskosten und wirkt
nur noch über die AfA – bei 2 % also über fünfzig Jahre verteilt.

Die App entscheidet das selbst, statt nur zu warnen:

- **Bemessungsgrundlage** ist der Gebäudeanteil der Anschaffungskosten inklusive
  Nebenkosten, also ohne Grund und Boden. 15 % davon sind die Grenze.
- **Das Fenster** sind drei Jahre ab dem Kaufdatum. Maßnahmen davor oder danach zählen
  nicht mit.
- **Alles oder nichts:** Wird die Grenze gerissen, kippen **alle** Maßnahmen des Zeitraums
  in die AfA, nicht nur der übersteigende Teil. Genau auf der Grenze bleibt alles sofort
  abziehbar – das Gesetz sagt „übersteigen".
- **Beide Quellen zählen zusammen:** Modernisierungen am Objekt und Buchungen der Kategorie
  *Erhaltungsaufwand*. Nur eines von beidem zu zählen wäre der häufigste Weg, die Grenze
  versehentlich zu reißen.

In der Spalte **Behandlung** steht je Maßnahme, was gilt:

| Einstellung | Bedeutung |
|---|---|
| automatisch (15 %) | Vorgabe – die Grenze entscheidet, und die Zeile sagt, wie es gerade ausgeht |
| sofort absetzen | feste Entscheidung, etwa für jährlich übliche Erhaltungsarbeiten |
| aktivieren (AfA) | feste Entscheidung, etwa für eine echte Erweiterung |

Die beiden festen Einstellungen gehen vor und zählen **nicht** in die Grenze hinein: Nach
§ 6 Abs. 1 Nr. 1a Satz 2 EStG bleiben jährlich übliche Erhaltungsarbeiten und echte
Erweiterungen ohnehin außen vor.

Der Verweis auf die Grenze steht überall dort, wo er gebraucht wird: im Untertitel der
Modernisierungskarte, über den Buchungen und unter dem Erhaltungsaufwand im Anhang der
Anlage V – jeweils mit dem verbrauchten Betrag, dem noch offenen Rest und dem Fristende.

**Wo die Rechnung an ihre Grenze kommt.** Das Gesetz rechnet mit **Nettobeträgen**, die App
durchgehend mit Bruttobeträgen (bei Wohnraumvermietung ist die Miete nach § 4 Nr. 12a UStG
umsatzsteuerfrei, die Vorsteuer also nicht abziehbar – brutto ist dort die richtige Größe,
hier aber die vorsichtigere). Liegt die Summe knapp unter der Grenze, ist das kein
Freibrief: dann lohnt der Blick des Steuerberaters. Ob eine Maßnahme überhaupt
Erhaltungsaufwand ist oder von vornherein Herstellungsaufwand, beurteilt die App nicht –
das sagst du ihr über die Spalte *Behandlung*.

**Fahrten** (+ Fahrt) werden aus Datum, Kilometern und Anlass erfasst; der Betrag wird
gerechnet, nicht eingetragen. Zwei Modi unter *Einstellungen*:

- **Reisekosten** (Vorgabe): 0,30 € je gefahrenem Kilometer, hin und zurück – der Regelfall
  laut BFH-Urteil IX R 18/15.
- **Entfernungspauschale**: 0,38 € je einfachem Kilometer (ab 1.1.2026), für den
  Ausnahmefall, dass ein Objekt zur regelmäßigen Tätigkeitsstätte wird – etwa bei sehr
  häufigen Fahrten.

**Nebenkostenabrechnung.** Für Objekte mit erfassten Einheiten zeigt die Objektansicht je
Einheit Vorauszahlung, anteilige umlagefähige Kosten und das Ergebnis als Nachzahlung oder
Erstattung – vorgewählt für das **Vorjahr**, wählbar auch das laufende und das vorletzte Jahr.
Verteilt wird nach Wohnfläche und **Mietdauer**: War eine Einheit nur einen Teil der
Besitzmonate vermietet, trägt der Mieter nur diesen Teil, den Leerstand der Vermieter.
Eine Näherung, kein Ersatz für die formelle, rechtssichere Abrechnung; bei einem Mieterwechsel
im Jahr braucht es je Mieter eine eigene Abrechnung, die App rechnet je Einheit.

- **Buchen:** legt das Ergebnis als *Nebenkosten-Nachzahlung* oder *-Erstattung* an, mit dem
  Datum der Zahlung. Beides zählt als Umlage im Jahr, in dem das Geld fließt (§ 11 EStG).
- **Zugestellt am:** Die Abrechnung muss dem Mieter spätestens zwölf Monate nach Ende des
  Abrechnungszeitraums zugehen, sonst ist eine Nachforderung ausgeschlossen (§ 556 Abs. 3 BGB).
  Solange für Einheiten mit Vorauszahlung kein Zustelldatum eingetragen ist, erinnert das
  Dashboard an die Frist, in den letzten 90 Tagen als Warnung.
- **Vorauszahlung anpassen:** Weicht die Vorauszahlung um mindestens 5 € und 5 % von den
  umlagefähigen Kosten laut Positionen ab (Jahreskosten nach Wohnfläche ÷ 12, aufgerundet),
  steht ein Vorschlag darunter; „Übernehmen“ legt im Mietvertrag eine neue Kondition mit
  derselben Kaltmiete an (§ 560 Abs. 4 BGB). Spätere Staffelstufen übernehmen die neue
  Vorauszahlung. Eine Kondition, die nur die Vorauszahlung ändert, setzt die Sperrfrist für
  Mieterhöhungen nicht neu in Gang.
- **Ohne Vorauszahlung:** Hat ein Objekt umlagefähige Kosten, ein laufender Vertrag aber keine
  Vorauszahlung, warnen Dashboard, Kostenkarte und Nebenkosten-Übersicht – dann fehlen die
  Umlagen auf der Einnahmenseite.

**Nebenkosten.** Die laufenden Kosten eines Objekts werden als **Positionen** erfasst
(Karte *Laufende Kosten*): Kostenart nach § 2 BetrKV oder nicht umlagefähig (Verwaltung,
Erhaltungsrücklage, Bankgebühren …), Betrag **je Fälligkeit**, Zahlweise (monatlich,
vierteljährlich, halbjährlich, jährlich) mit erstem Fälligkeitsmonat, dazu zwei Haken:
*Hausgeld* – Teil des Hausgelds an die Gemeinschaft, immer monatlich gezahlt – und
*umlagefähig*, vorbelegt aus der Kostenart. Umlagefähig ist eine Position nur, wenn der
Mietvertrag die Umlage vereinbart; die Rücklage ist es nie. Die früheren Sammelfelder wurden
beim Update zu *Sammelposten* mit denselben Beträgen – teile sie anhand des Wirtschaftsplans
auf, dann erscheinen die Kostenarten einzeln.

Der Menüpunkt *Nebenkosten* zeigt je Objekt oder fürs Portfolio eine Tabelle über zwölf
Monate: jede Position im Monat ihrer Fälligkeit, getrennt nach umlagefähig, nicht umlagefähig
und Erhaltungsrücklage, darunter Gesamt, der Anteil über das Hausgeld, die Vorauszahlungen der
Mieter und die **Deckung** (Vorauszahlung minus umlagefähige Kosten – negativ heißt
voraussichtliche Nachzahlung). Am Handy blättert man Monat für Monat.

Steuerlich zählt jede Position über ihre Zahlungsart: umlagefähige und nicht umlagefähige
Kosten sind Werbungskosten im Jahr der Zahlung (Betriebs- bzw. Verwaltungskosten), die
Rücklage nicht (siehe unten). Das Steuerjahr zeigt dazu die Karte *Nebenkosten laut
Positionen*, und die Herleitung nennt bei jeder Monatszeile die enthaltenen Positionen.

**Änderungen ab einem Monat.** Jede Position kann ein *gilt ab* und *gilt bis* haben
(Spalte *gilt*). Ein Betrag, der direkt in der Tabelle geändert wird, gilt für den ganzen
Zeitraum der Position – also auch rückwirkend. Ändert sich ein Betrag ab einem Monat, teilt
**„ab …“** die Position: Der bisherige Stand endet im Vormonat, der neue beginnt im gewählten
Monat. Vergangene Monate, Buchhaltung und abgeschlossene Steuerjahre bleiben so unverändert.
**„Neuer Wirtschaftsplan …“** macht das für alle Positionen auf einmal (wahlweise nur die im
Hausgeld) mit einem Prozentsatz; einzelne Beträge lassen sich danach mit „ab …“ feinjustieren.
Ausgelaufene Stände sind ausgeblendet („Frühere Stände anzeigen“). Renditen und Forecast
rechnen mit dem Stand des laufenden Monats.

Grenzen: Die Übersicht zeigt den **Plan** – Korrekturen einzelner Monate in der Buchhaltung
ändern Buchhaltung und Steuer, nicht diese Tabelle. Wer Grundsteuer oder Versicherung zusätzlich
als Buchung erfasst, zählt sie doppelt; die Übersicht weist darauf hin. Die Excel-Mappe kennt
nur Sammelbeträge.

**Steuerjahr.** Eigener Menüpunkt mit einer Aufstellung der Einnahmen und Werbungskosten in
der Gliederung der Anlage V – je Objekt und fürs ganze Portfolio, exportierbar als CSV.
**Die Erhaltungsrücklage ist kein Werbungskostenabzug.** Einzahlungen in die Rücklage
einer Wohnungseigentümergemeinschaft mindern den Cashflow – das Geld ist weg – aber **nicht
die Einkünfte**. Abziehbar werden sie erst, wenn die Gemeinschaft das Geld tatsächlich
verausgabt (BFH, Urteil vom 14.01.2025, IX R 19/24). Der Grund ist einleuchtend: Vorher lässt
sich gar nicht beurteilen, ob daraus sofort abziehbarer Erhaltungsaufwand oder nur über die
AfA wirkender Herstellungsaufwand wird.

Die App trennt das deshalb sauber: Die Position *Erhaltungsrücklage* am Objekt fließt in den
Cashflow, bleibt aber aus Anlage V, Einkünften und Steuer heraus – in der Ist-Rechnung, in
der Runrate und im Forecast gleichermaßen. **Sobald die Gemeinschaft das Geld ausgibt**,
erfasst du deinen Anteil als Buchung der Kategorie *Erhaltungsaufwand* und setzt bei
Eigentumswohnungen den Haken **„aus der Rücklage bezahlt“**. Dann zählt der Betrag steuerlich
in diesem Jahr, mit allen Folgen aus § 82b EStDV und der 15-%-Grenze – im Cashflow, in der
Liquidität und in den Summen der Buchhaltung aber nicht, denn das Geld ist schon mit dem
Hausgeld abgeflossen. Ohne den Haken stünde es dort doppelt.

**Anhang: Herleitung der Werbungskosten.** Je Objekt schließt eine Karte die Aufstellung
ab, die zeigt, woraus jede Position entstanden ist – und zwar aus denselben Quellen, aus
denen die Summen gebildet werden. Beide stimmen deshalb auf den Cent überein.

- **AfA** als Rechenweg: Anschaffungskosten, abzüglich Grundstücksanteil, zuzüglich
  aktivierter Modernisierung, ergibt die Bemessungsgrundlage; davon der AfA-Satz, im
  Anschaffungsjahr zeitanteilig ab dem Kaufmonat.
- **Erhaltungsaufwand** je Maßnahme mit Datum und, wo verteilt, dem Jahresanteil samt
  Hinweis auf § 82b EStDV – aus beiden Quellen, Buchungen wie Modernisierungen. Darunter
  steht immer der Stand der 15-%-Grenze. Aktivierte Beträge stehen gesondert als Hinweis,
  mit dem Grund (Grenze überschritten oder von Hand gesetzt) – sie sind keine
  Werbungskosten, sondern stecken in der AfA.
- **Alles Übrige** als die einzelnen Zahlungen. Gleichbleibende Monatsbeträge werden zu einer
  Zeile zusammengefasst („12 × 155,00 €, Jan–Dez"); sobald ein Monat korrigiert wurde, steht
  jeder Monat einzeln. **Fahrten** zeigen den Rechenweg: Kilometer × Satz × 2.

Der Anhang beginnt beim Drucken auf einer neuen Seite und lässt sich so getrennt beilegen.

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
- **Die Spekulationsfrist rechnet ab `kaufdatum`.** Maßgeblich ist nach § 23 EStG das
  Datum des **Kaufvertrags**; das Feld dient in der App zugleich dem AfA-Beginn und meint
  damit eher den Übergang von Nutzen und Lasten. Weichen beide ab, ist die angezeigte
  Frist eine Orientierung und kein Freibrief.
- **Ein Verkauf vor Ablauf einer § 82b-Verteilung** lässt den Restbetrag in einer Summe
  abziehbar werden. Die App kennt keinen Verkaufsvorgang und rechnet das nicht.

**Staffel- und Indexmiete.** Unter *Vertragsdaten* legst du fest, was vereinbart ist. Die
Karte *Mietanpassung* zeigt danach jeweils etwas anderes – die drei Fälle haben rechtlich
wenig gemeinsam.

**Staffelmiete (§ 557a BGB).** Über *Staffeln erzeugen* in den Mietkonditionen legst du alle
Stufen in einem Zug an: erste Staffel, Abstand, Erhöhung als Betrag oder Prozentsatz, Anzahl.
Die Vorschau rechnet mit, bevor etwas gespeichert wird. Die Staffeln landen als gewöhnliche
Konditionen in der Zeitreihe – es gibt keine zweite Liste daneben, die davon abweichen
könnte. Weil § 557a den Ausweis **als Geldbetrag** verlangt, wird ein Prozentsatz sofort in
Beträge umgerechnet; jede Staffel muss mindestens ein Jahr gelten, kürzere Abstände lehnt die
App ab.

> **Die Stufe greift von selbst** – eine Erklärung braucht es nicht. Trotzdem erinnert die App
> 90 Tage vorher daran, den Mieter zu informieren: Sonst läuft sein Dauerauftrag weiter auf
> den alten Betrag, und es entsteht ein Rückstand, den niemand gewollt hat.

**Indexmiete (§ 557b BGB).** Du trägst den Verbraucherpreisindex ein, auf dem die heutige
Miete beruht. Gibst du später den aktuellen Indexstand ein, rechnet die App die neue Miete,
die Veränderung in Prozent und den frühesten Wirksamkeitstermin aus und trägt sie auf Wunsch
als Mietanpassung ein.

> **Hier greift nichts von selbst.** Nach § 557b Abs. 3 BGB wird die Erhöhung erst durch eine
> **Erklärung in Textform** wirksam, in der die eingetretene Indexänderung und die neue Miete
> als Geldbetrag stehen – geschuldet ist sie ab Beginn des **übernächsten** Monats nach
> Zugang. Ohne diese Erklärung bleibt die alte Miete geschuldet. Das ist keine Höflichkeit,
> sondern Wirksamkeitsvoraussetzung, und die App weist bei jedem Schritt darauf hin.

Bei beiden Formen sind Erhöhungen nach § 558 (Vergleichsmiete) daneben ausgeschlossen. Zu jeder
der drei Formen setzt die App auf Wunsch ein **Schreiben** auf, siehe *Schreiben an den Mieter*
weiter unten.

**Mieterhöhung.** Jeder Mietvertrag zeigt den Spielraum bis zur ortsüblichen
Vergleichsmiete nach § 558 BGB. Drei Schranken gelten gleichzeitig:

- **Sperrfrist.** Das Erhöhungsverlangen ist frühestens ein Jahr nach der letzten Erhöhung
  zulässig, wirksam wird die neue Miete erst, wenn die bisherige **15 Monate** unverändert
  galt. Das sind zwei verschiedene Zeitpunkte, und die Karte nennt beide.
- **Kappungsgrenze.** Höchstens 20 % in drei Jahren, in Gebieten mit angespanntem
  Wohnungsmarkt 15 %. Welche gilt, sagt die Verordnung deines Landes – die Vorgabe steht in
  den Annahmen, abweichend trägst du sie am Objekt ein. Bezugspunkt ist die Miete **drei
  Jahre vor dem Wirksamwerden**, nicht die heutige.
- **Ortsübliche Vergleichsmiete.** Die absolute Obergrenze. Sie steht in keinem Datensatz
  dieser App, sondern im Mietspiegel deiner Gemeinde; eingetragen wird sie je Wohnung in
  €/m². **Ohne diesen Wert kennt die Rechnung nur die Kappungsgrenze** und sagt das auch –
  die Zahl taugt dann nicht als Forderung.

Bei **Staffel- und Indexmiete** entfällt das: Dort ist § 558 ausgeschlossen (§ 557a Abs. 2,
§ 557b Abs. 2 BGB), die Miete folgt der Vereinbarung. Das Dashboard meldet Verträge mit
Spielraum erst, wenn die Sperrfrist in den nächsten drei Monaten abläuft – vorher ließe sich
ohnehin nichts durchsetzen.

**Modernisierung und Mietpreisbremse bleiben außen vor.** Modernisierungsumlagen (§ 559 BGB)
und die Mietpreisbremse bei Neuvermietung (§ 556d BGB) rechnet die App nicht – weder die
Spielraum-Karte noch das Schreiben.

### Schreiben an den Mieter

Auf der Karte *Mieterhöhung*, *Indexmiete* oder *Staffelmiete* öffnet **Schreiben erstellen** einen
druckfertigen Entwurf. Die App **verschickt nichts** – sie setzt den Text auf, aus den Beträgen
und Fristen, die die Karte schon rechnet; eine zweite Rechnung gibt es nicht. Gedruckt wird auf
A4 im Hochformat, das Anschriftfeld ist an DIN 5008 angelehnt (Fensterkuvert, aber ohne
Gewähr: Drucker und Umschlag unterscheiden sich). Dein Name und deine Anschrift als Absender
stehen unter *Einstellungen → Vermieter*.

Die drei Formen sind rechtlich grundverschieden, und die Schreiben sind es auch:

| | Verlangen nach § 558 | Indexerklärung nach § 557b | Staffel nach § 557a |
|---|---|---|---|
| Braucht der Mieter zuzustimmen? | **ja** | nein | nein |
| Form | Textform **und Begründung** (§ 558a) | Textform, Pflichtinhalt | keine – die Staffel wirkt kraft Vertrag |
| Pflichtinhalt | Begründung, hier der Mietspiegel | Indexänderung **und** Miete als Geldbetrag | – |
| Wirksam ab | Beginn des dritten Kalendermonats nach Zugang | Beginn des übernächsten Monats nach Zugang | zum vereinbarten Termin |
| Das Schreiben ist | das Verlangen selbst, mit einer Seite für die Zustimmung | die Erklärung selbst | eine **Höflichkeit**, und der Text sagt es |

Was die App dabei **nicht** durchgehen lässt:

- **Kein Brief ohne Pflichtangaben.** Fehlen Absender oder – beim Verlangen – die
  Vergleichsmiete der Einheit, gibt es nur den Hinweis, was fehlt. Ein Brief ohne sie sähe
  fertig aus und wäre es nicht.
- **Nicht versandfertig** (Knopf *Drucken* gesperrt, der Brief steht trotzdem): die Fundstelle
  des Mietspiegels fehlt, das Verlangen käme zu früh (frühestens ein Jahr nach der letzten
  Mietänderung), die gewünschte Miete liegt über der Obergrenze, die Objektanschrift fehlt.
- **Die Bezugsmiete der Kappungsgrenze gehört zum Datum des Briefs.** Sie ist die Miete drei
  Jahre vor dem Wirksamwerden *dieses* Schreibens, nicht des frühestmöglichen Termins – hat
  sich die Miete dazwischen geändert, nennte der Brief sonst eine Zahl, die nicht zu seinem
  Datum gehört.

Das Briefdatum, die Fundstelle des Mietspiegels und eine Wunschmiete unterhalb der Obergrenze
trägst du auf der Seite ein; sie bleiben dort und kommen **nicht** ins Portfolio. Nur die
Fundstelle merkt sich das Gerät, denn sie bleibt von Brief zu Brief dieselbe.

**Fristen laufen ab Zugang, nicht ab Briefdatum.** Die App rechnet vom Briefdatum; kommt das
Schreiben erst im nächsten Kalendermonat an, verschiebt sich alles um einen Monat. Wer den
Zugang beweisen muss, übergibt persönlich gegen Quittung oder lässt einen Einwurf
dokumentieren.

**Bei der Indexerklärung: erst das Schreiben, dann eintragen.** *Als Mietanpassung eintragen*
setzt den Basis-Indexstand auf den neuen Wert; danach fehlt dem Schreiben der alte.

**Ein Textbaustein, keine Rechtsberatung.** Ob die Voraussetzungen im Einzelfall vorliegen, prüft
die App nicht – ob der Mietspiegel zur Wohnung passt (Baujahr, Ausstattung, Lage), ob die
Kappungsgrenze am Ort 15 oder 20 % beträgt, ob frühere Erhöhungen nach §§ 559, 560 BGB die
Rechnung verschieben. Im Zweifel fragt man den Mieterverein, Haus & Grund oder eine Anwältin.

**Zahlungseingang.** Abgeleitete Mieten und Nebenkosten gelten zunächst als geflossen – so
war es immer, und solange du nichts abhakst, ändert sich nichts. Über den Knopf in der
Spalte *Status* schaltest du eine Zeile im Kreis: *nicht verfolgt → offen → eingegangen*.
Ein Teilbetrag lässt sich ebenso eintragen.

Was offen ist, zählt **weder im Cashflow noch als Einnahme** – das ist nicht nur
Buchhaltung, sondern steuerlich das Richtige: Nach dem Zuflussprinzip (§ 11 EStG) ist nicht
gezahlte Miete keine Einnahme. Der Filter *Nur offene Posten*, die Kachel *Offen* und ein
Hinweis im Dashboard führen die Rückstände zusammen.

Der **Forecast bleibt davon unberührt**. Er ist vorausschauend und rechnet mit den
Stammdaten; ein Rückstand aus dem Mai gehört nicht in eine Zehnjahresprognose.

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
