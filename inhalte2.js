// Inhalte fuer die Gemeinschaftsspiele (eigene Listen). Seit Schritt 2 (31.10.2026) hinten verlaengert aus inhalte_mehr.js.
import * as M from "./inhalte_mehr.js";
// Begriffe erklaeren: [Begriff, verbotene Woerter...]
export const BEGRIFFE = [
  ["Zahnarzt", "Zähne", "Bohrer", "Praxis", "Termin"], ["Kinderwagen", "Baby", "schieben", "Räder", "Spaziergang"], ["Wickeltisch", "Windel", "Baby", "wechseln", "Tisch"],
  ["Elternabend", "Schule", "Lehrer", "Kinder", "Treffen"], ["Kaffeemaschine", "Kaffee", "Bohnen", "Morgen", "kochen"], ["Staubsauger", "saugen", "Boden", "Dreck", "Teppich"],
  ["Weihnachtsmann", "Geschenke", "Bart", "rot", "Rentier"], ["Osterhase", "Eier", "Ostern", "verstecken", "Hase"], ["Sandkasten", "Spielplatz", "Schaufel", "Kinder", "Sand"],
  ["Gummibärchen", "Haribo", "süß", "bunt", "Bär"], ["Fernbedienung", "Fernseher", "Knopf", "umschalten", "Sofa"], ["Wecker", "aufstehen", "klingeln", "Morgen", "Uhr"],
  ["Urlaub", "Reise", "Strand", "Koffer", "Ferien"], ["Grillen", "Fleisch", "Würstchen", "Kohle", "Sommer"], ["Feuerwehr", "Feuer", "löschen", "rot", "Sirene"],
  ["Achterbahn", "Freizeitpark", "schnell", "Looping", "schreien"], ["Hochzeit", "Braut", "heiraten", "Ring", "Kirche"], ["Geburtstag", "Kuchen", "Kerzen", "Geschenke", "Party"],
  ["Smartphone", "Handy", "Apps", "telefonieren", "Display"], ["Pizza", "Italien", "Käse", "Ofen", "Teig"], ["Schneemann", "Schnee", "Karotte", "Winter", "Kugel"],
  ["Zahnfee", "Zahn", "Kissen", "Geld", "Nacht"], ["Kuscheltier", "Teddy", "weich", "Bett", "Kind"], ["Nachtisch", "süß", "Essen", "nach", "Pudding"],
  ["Waschmaschine", "Wäsche", "waschen", "Trommel", "Kleidung"], ["Fahrrad", "treten", "Räder", "Lenker", "fahren"], ["Tankstelle", "Benzin", "Auto", "tanken", "Diesel"],
  ["Supermarkt", "einkaufen", "Kasse", "Lebensmittel", "Regal"], ["Schwimmbad", "Wasser", "Becken", "schwimmen", "Rutsche"], ["Kindergarten", "Kita", "Erzieher", "Kinder", "spielen"],
  ["Mittagsschlaf", "schlafen", "Mittag", "müde", "Bett"], ["Trotzphase", "Kind", "schreien", "nein", "Wut"], ["Brettspiel", "würfeln", "Spielfiguren", "Monopoly", "Tisch"],
  ["Flughafen", "Flugzeug", "fliegen", "Koffer", "Gate"], ["Kühlschrank", "kalt", "Essen", "Küche", "Tür"], ["Regenbogen", "Farben", "Regen", "Sonne", "Himmel"],
  ["Zirkus", "Clown", "Manege", "Zelt", "Akrobat"], ["Bauernhof", "Kühe", "Traktor", "Bauer", "Tiere"], ["Dinosaurier", "ausgestorben", "T-Rex", "groß", "Urzeit"],
  ["Hausaufgaben", "Schule", "Lernen", "Heft", "Lehrer"], ["Feierabend", "Arbeit", "Ende", "nach Hause", "Abend"], ["Nachbar", "nebenan", "Haus", "wohnen", "Tür"],
  ["Schnuller", "Baby", "Mund", "nuckeln", "beruhigen"], ["Fläschchen", "Milch", "Baby", "trinken", "Sauger"], ["Laufstall", "Baby", "Gitter", "spielen", "laufen"],
  ["Gute-Nacht-Geschichte", "Buch", "vorlesen", "schlafen", "Bett"], ["Rutsche", "Spielplatz", "runter", "Kinder", "rutschen"], ["Weihnachtsbaum", "Tanne", "Kugeln", "Lichter", "Dezember"],
  ["Navi", "Weg", "Auto", "Richtung", "Karte"], ["Selfie", "Foto", "Handy", "selbst", "Kamera"], ["Popcorn", "Kino", "Mais", "Puffen", "salzig"], ["Hängematte", "liegen", "schaukeln", "Garten", "Netz"],
  ["Lottogewinn", "Zahlen", "Millionen", "Glück", "Schein"], ["Umzug", "Kartons", "Wohnung", "tragen", "neu"], ["Kopfschmerzen", "Kopf", "Tablette", "weh", "Migräne"],
  ["Winterreifen", "Auto", "Schnee", "wechseln", "Gummi"], ["Klopapier", "Toilette", "Rolle", "Papier", "Bad"], ["Zahnspange", "Zähne", "gerade", "Draht", "Kieferorthopäde"],
  ["Sonnenbrand", "Sonne", "rot", "Haut", "Creme"], ["Muskelkater", "Sport", "weh", "Muskeln", "Training"], ["Elternzeit", "Baby", "Arbeit", "Pause", "Mutter"],
].concat(M.BEGRIFFE_MEHR);
// Pantomime / Zeichnen: einfachere Begriffe
export const PANTOMIME = [
  "Zähne putzen", "Baby wickeln", "Auto einparken", "Hund ausführen", "Fenster putzen", "Pizza backen", "Kuh melken", "Schneeballschlacht", "Achterbahn fahren", "Zug verpassen",
  "Fliege fangen", "Spaghetti essen", "Baum fällen", "Kinderwagen schieben", "Zelt aufbauen", "Geschenk auspacken", "Selfie machen", "Rasenmähen", "Gitarre spielen", "Schlittschuh laufen",
  "Koffer packen", "Fußball-Tor schießen", "Bügeln", "Angeln", "Babybrei füttern", "Wäsche aufhängen", "Kerzen auspusten", "Seil springen", "Surfen", "Bowling",
  "Zwiebel schneiden", "Einen Reifen wechseln", "Yoga", "Im Stau stehen", "Eis essen bei Hitze", "Ein Baby in den Schlaf wiegen", "Tanzen auf einer Hochzeit", "Taucher", "Bodybuilder", "Ballerina",
].concat(M.PANTOMIME_MEHR);
// Wer bin ich: Figuren und Personen
export const FIGUREN = [
  "Pumuckl", "Biene Maja", "Peppa Wutz", "Spongebob", "Homer Simpson", "Harry Potter", "Darth Vader", "Elsa (Eiskönigin)", "Shrek", "Mickey Maus",
  "Pippi Langstrumpf", "Super Mario", "Pikachu", "Batman", "Spider-Man", "Der Grinch", "Rotkäppchen", "Schneewittchen", "Sherlock Holmes", "James Bond",
  "Albert Einstein", "Angela Merkel", "Helene Fischer", "Michael Jackson", "Manuel Neuer", "Heidi Klum", "Dieter Bohlen", "Barbie", "Ken", "Yoda",
  "Gandalf", "Captain Jack Sparrow", "Tarzan", "Die Maus (Sendung mit der Maus)", "Bob der Baumeister", "Paw Patrol Chase", "Feuerwehrmann Sam", "Benjamin Blümchen", "Bibi Blocksberg", "Sandmännchen",
  "Lionel Messi", "Taylor Swift", "Elon Musk", "Queen Elizabeth", "Kleopatra", "Napoleon", "Mozart", "Asterix", "Obelix", "Garfield",
  "Winnie Puuh", "Kermit der Frosch", "Krümelmonster", "Nemo", "Dory", "Simba", "Olaf (Schneemann)", "Rapunzel", "Aladdin", "Die Biene aus der Werbung",
].concat(M.FIGUREN_MEHR);
// Spion: Orte, an denen alle ausser dem Spion sind
export const ORTE = [
  "Kreißsaal", "Kindergeburtstag", "Spielplatz", "Flugzeug", "Kreuzfahrtschiff", "Zahnarztpraxis", "Supermarkt-Kasse", "Hochzeit", "Fitnessstudio", "Kino",
  "Weihnachtsmarkt", "Schwimmbad", "Campingplatz", "Bauernhof", "Polizeiwache", "Krankenhaus", "Freizeitpark", "Fußballstadion", "Bibliothek", "Friseursalon",
  "Raumstation", "U-Boot", "Zirkus", "Zoo", "Elternabend", "Möbelhaus", "Tankstelle", "Oktoberfest", "Skihütte", "Strandbar",
  "Kindergarten", "Flughafen-Sicherheitskontrolle", "Autowaschanlage", "Escape Room", "Kirche", "Baumarkt", "Bäckerei", "Disco", "Waschsalon", "Piratenschiff",
].concat(M.ORTE_MEHR);
// Stadt-Land-Fluss-Kategorien (immer 6 werden gezogen)
export const SLF_KAT = ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf", "Essen", "Marke", "Promi", "Etwas im Kinderzimmer", "Ausrede fürs Zuspätkommen", "Film oder Serie",
  "Getränk", "Sportart", "Körperteil", "Kleidung", "Musiker", "Pflanze", "Spielzeug", "Etwas im Badezimmer", "Schimpfwort (harmlos!)", "Grund zum Feiern"].concat(M.SLF_MEHR);
// Quiz: [Frage, richtige Antwort, falsch, falsch, falsch]
export const QUIZ = [
  ["Wie viele Bundesländer hat Deutschland?", "16", "14", "15", "18"], ["Welches Tier ist das größte Säugetier?", "Blauwal", "Elefant", "Giraffe", "Pottwal"],
  ["Wie heißt die Hauptstadt von Australien?", "Canberra", "Sydney", "Melbourne", "Perth"], ["Wie viele Beine hat eine Spinne?", "8", "6", "10", "12"],
  ["In welchem Jahr fiel die Berliner Mauer?", "1989", "1990", "1987", "1991"], ["Wer malte die Mona Lisa?", "Leonardo da Vinci", "Michelangelo", "Picasso", "Rembrandt"],
  ["Welcher Planet ist der Sonne am nächsten?", "Merkur", "Venus", "Mars", "Erde"], ["Wie viele Minuten hat ein Tag?", "1440", "1240", "1640", "960"],
  ["Was ist die Hauptzutat von Guacamole?", "Avocado", "Tomate", "Gurke", "Erbse"], ["Wie viele Zähne hat ein Milchgebiss?", "20", "24", "28", "16"],
  ["Ab welchem Alter dürfen Kinder in Deutschland vorne im Auto sitzen (ohne Sitz)?", "ab 12 Jahren oder 1,50 m", "ab 6 Jahren", "ab 10 Jahren", "ab 14 Jahren"],
  ["Wie lange dauert eine normale Schwangerschaft ungefähr?", "40 Wochen", "36 Wochen", "44 Wochen", "32 Wochen"], ["Welches Land hat die meisten Einwohner?", "Indien", "China", "USA", "Indonesien"],
  ["Wie heißt der längste Fluss Deutschlands (komplett)?", "Donau", "Rhein", "Elbe", "Main"], ["Was misst ein Barometer?", "Luftdruck", "Temperatur", "Wind", "Feuchtigkeit"],
  ["Wie viele Spieler hat eine Fußballmannschaft auf dem Feld?", "11", "10", "12", "9"], ["Welche Farbe hat ein Smaragd?", "Grün", "Blau", "Rot", "Gelb"],
  ["Wie heißt das kleinste Bundesland?", "Bremen", "Saarland", "Hamburg", "Berlin"], ["Wovon ernährt sich ein Koala?", "Eukalyptus", "Bambus", "Gras", "Insekten"],
  ["Wie viele Herzen hat ein Oktopus?", "3", "1", "2", "4"], ["Was ist H2O?", "Wasser", "Sauerstoff", "Salz", "Wasserstoff"],
  ["Welches Instrument hat 88 Tasten?", "Klavier", "Orgel", "Akkordeon", "Keyboard mit 61"], ["Wer schrieb „Die Leiden des jungen Werther“?", "Goethe", "Schiller", "Lessing", "Kafka"],
  ["Wie hoch ist die Zugspitze ungefähr?", "2962 m", "2450 m", "3120 m", "2700 m"], ["Welches Gas atmen Pflanzen bei Fotosynthese ein?", "Kohlendioxid", "Sauerstoff", "Stickstoff", "Helium"],
  ["Wie viele Kontinente gibt es?", "7", "5", "6", "8"], ["Welches Tier legt die größten Eier?", "Strauß", "Emu", "Pinguin", "Krokodil"],
  ["Wie heißt der Erfinder des Buchdrucks mit beweglichen Lettern?", "Johannes Gutenberg", "Martin Luther", "Albrecht Dürer", "Isaac Newton"],
  ["Wie viele Sekunden hat eine Stunde?", "3600", "6000", "360", "1200"], ["Was ist die Hauptstadt von Kanada?", "Ottawa", "Toronto", "Vancouver", "Montreal"],
  ["Welche Farbe hat das Innere einer Kiwi?", "Grün", "Gelb", "Rot", "Weiß"], ["Wie viele Felder hat ein Schachbrett?", "64", "100", "81", "49"],
  ["In welcher Stadt steht der Kölner Dom?", "Köln", "Bonn", "Düsseldorf", "Aachen"], ["Wie viele Knochen hat ein erwachsener Mensch?", "206", "186", "226", "256"],
  ["Was ist das schnellste Landtier?", "Gepard", "Löwe", "Antilope", "Windhund"], ["Wie nennt man ein Baby-Känguru?", "Joey", "Kitz", "Welpe", "Fohlen"],
  ["Wie viele Ecken hat ein Würfel?", "8", "6", "12", "4"], ["Welcher Monat hat 28 oder 29 Tage?", "Februar", "April", "Juni", "November"],
  ["Woraus wird Butter gemacht?", "Sahne", "Milchpulver", "Joghurt", "Quark"], ["Wie heißt der Vogel, der rückwärts fliegen kann?", "Kolibri", "Specht", "Spatz", "Möwe"],
].concat(M.QUIZ_MEHR);

// Quizshow: Halloween-Runde (selbst geschrieben, 27.10.2026; erste Antwort ist richtig, Anzeige mischt die Reihenfolge)
export const QUIZ_HALLOWEEN = [
  ["Wofür steht „Halloween“ ursprünglich?", "Abend vor Allerheiligen", "Nacht der Kürbisse", "Fest der Hexen", "Tag der Toten"],
  ["Aus welchem keltischen Fest ist Halloween entstanden?", "Samhain", "Beltane", "Imbolc", "Lughnasadh"],
  ["Was wurde in Irland ausgehöhlt, bevor es Kürbislaternen gab?", "Rüben", "Melonen", "Kartoffeln", "Äpfel"],
  ["Wie heißt der Mann aus der irischen Sage, nach dem die Kürbislaterne benannt ist?", "Jack", "Tom", "Will", "Sam"],
  ["Welcher Feiertag folgt am 1. November auf Halloween?", "Allerheiligen", "Allerseelen", "Martinstag", "Reformationstag"],
  ["Welcher Feiertag ist am 31. Oktober in mehreren Bundesländern?", "Reformationstag", "Allerheiligen", "Buß- und Bettag", "Erntedank"],
  ["Was rufen Kinder in Deutschland an Halloween an der Haustür?", "Süßes oder Saures", "Gruß oder Graus", "Kürbis oder Kuchen", "Gabe oder Grab"],
  ["Wer schrieb den Roman „Dracula“?", "Bram Stoker", "Mary Shelley", "Edgar Allan Poe", "Stephen King"],
  ["Wer schrieb den Roman „Frankenstein“?", "Mary Shelley", "Bram Stoker", "Jules Verne", "Oscar Wilde"],
  ["In welchem Land steht Schloss Bran, das oft „Draculas Schloss“ genannt wird?", "Rumänien", "Ungarn", "Bulgarien", "Serbien"],
  ["Was hält Vampire laut Volksglauben fern?", "Knoblauch", "Zwiebeln", "Petersilie", "Ingwer"],
  ["Womit kann man laut Sage einen Werwolf töten?", "Silberkugel", "Goldkugel", "Kupfernagel", "Eisenkette"],
  ["Bei welcher Mondphase verwandelt sich ein Werwolf?", "Vollmond", "Neumond", "Halbmond", "Sichelmond"],
  ["Was trinken Vampirfledermäuse?", "Blut", "Nektar", "Milch", "Baumsaft"],
  ["Auf welchem Kontinent leben Vampirfledermäuse in freier Natur?", "Amerika", "Afrika", "Asien", "Europa"],
  ["Welches Säugetier kann als einziges richtig fliegen?", "Fledermaus", "Flughörnchen", "Gleithörnchen", "Kolugo"],
  ["Wie viele Augen haben die meisten Spinnen?", "8", "2", "4", "6"],
  ["Wie nennt man die Angst vor Spinnen?", "Arachnophobie", "Klaustrophobie", "Akrophobie", "Agoraphobie"],
  ["Welches Fest feiert man in Mexiko am 1. und 2. November?", "Tag der Toten", "Fest der Geister", "Nacht der Masken", "Tag der Kerzen"],
  ["Wie viele Knochen bilden den menschlichen Schädel (ca.)?", "22", "12", "32", "8"],   // 31.10.: war doppelt mit dem Quiz allgemein
  ["Welcher ist der größte Knochen des Menschen?", "Oberschenkelknochen", "Schienbein", "Oberarmknochen", "Becken"],
  ["Botanisch gesehen ist ein Kürbis eine …", "Beere", "Nuss", "Steinfrucht", "Wurzel"],
  ["Auf welchem Berg tanzen der Sage nach in der Walpurgisnacht die Hexen?", "Brocken", "Zugspitze", "Feldberg", "Watzmann"],
  ["Wer schrieb das Kinderbuch „Die kleine Hexe“?", "Otfried Preußler", "Michael Ende", "Astrid Lindgren", "Cornelia Funke"],
  ["Wie heißt der Rabe der kleinen Hexe?", "Abraxas", "Krabat", "Jakob", "Rudi"],
  ["In welchem Ort spielt die Geschichte vom kopflosen Reiter?", "Sleepy Hollow", "Salem", "Transsilvanien", "Twin Peaks"],
  ["Welcher Vogel gilt im Volksglauben als „Totenvogel“?", "Steinkauz", "Amsel", "Specht", "Taube"],
  ["Welche Farbe hat das Blut einer Vogelspinne?", "bläulich", "rot", "grün", "gelb"],
].concat(M.QUIZ_HALLOWEEN_MEHR);
