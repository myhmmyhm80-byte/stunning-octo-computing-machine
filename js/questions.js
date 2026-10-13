// Die Kennenlern-Fragen. Der Chatbot benutzt die Antworten, damit alles zum Schüler passt.
// type: text | number | single | multi
export const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen',
  'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen', 'Rheinland-Pfalz',
  'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
];

export const FAECHER = [
  'Mathe', 'Deutsch', 'Englisch', 'Französisch', 'Spanisch', 'Latein', 'Physik', 'Chemie',
  'Biologie', 'Geschichte', 'Geographie', 'Gemeinschaftskunde / Politik', 'Wirtschaft',
  'Informatik', 'Musik', 'Kunst', 'Religion / Ethik', 'Sport', 'NwT', 'Philosophie',
];

const NIVEAUS = ['A1 (Anfänger)', 'A2', 'B1', 'B2', 'C1', 'C2 (sehr gut)', 'Lerne ich nicht'];

export const QUESTIONS = [
  { id: 'name', q: 'Hallo! 👋 Ich bin dein LernPilot. Wie heißt du?', type: 'text', placeholder: 'Dein Vorname' },
  { id: 'alter', q: 'Wie alt bist du?', type: 'number', placeholder: 'z. B. 16' },
  { id: 'bundesland', q: 'In welchem Bundesland gehst du zur Schule? (Jedes Bundesland hat einen anderen Lehrplan.)', type: 'single', options: BUNDESLAENDER },
  { id: 'stadt', q: 'In welcher Stadt wohnst du?', type: 'text', placeholder: 'z. B. Pforzheim', optional: true },
  { id: 'schulart', q: 'Welche Schulart besuchst du?', type: 'single', options: ['Gymnasium', 'Gemeinschaftsschule', 'Realschule', 'Gesamtschule', 'Berufliches Gymnasium', 'Berufskolleg / Fachoberschule', 'Andere'] },
  { id: 'klasse', q: 'In welcher Klasse bist du?', type: 'single', options: ['10', '11', '12', '13', 'J1', 'J2'] },
  { id: 'abschluss', q: 'Welchen Abschluss möchtest du machen?', type: 'single', options: ['Abitur', 'Fachhochschulreife', 'Mittlere Reife', 'Weiß ich noch nicht'] },
  { id: 'abschlussjahr', q: 'In welchem Jahr ist dein Abschluss (ungefähr)?', type: 'number', placeholder: 'z. B. 2028', optional: true },
  { id: 'muttersprache', q: 'Was ist deine Muttersprache?', type: 'text', placeholder: 'z. B. Arabisch' },
  { id: 'sprachenZuhause', q: 'Welche Sprachen sprichst du noch?', type: 'multi', options: ['Deutsch', 'Englisch', 'Arabisch', 'Französisch', 'Spanisch', 'Türkisch', 'Russisch', 'Ukrainisch', 'Andere'] },
  { id: 'deutschNiveau', q: 'Wie gut ist dein Deutsch?', type: 'single', options: NIVEAUS.slice(0, 6) },
  { id: 'erklaerSprache', q: 'In welcher Sprache soll ich dir Dinge erklären?', type: 'single', options: ['Deutsch (einfach)', 'Deutsch (normal)', 'Deutsch mit Arabisch-Hilfe', 'Deutsch mit Englisch-Hilfe', 'Englisch'] },
  { id: 'faecher', q: 'Welche Fächer hast du? (Mehrere wählen)', type: 'multi', options: FAECHER },
  { id: 'leistungsfaecher', q: 'Hast du Leistungsfächer oder Leistungskurse? Welche?', type: 'multi', options: [...FAECHER, 'Keine / noch nicht'], optional: true },
  { id: 'lieblingsfach', q: 'Was ist dein Lieblingsfach?', type: 'text', placeholder: 'z. B. Physik' },
  { id: 'schwerFaecher', q: 'Welche Fächer sind schwer für dich? (Mehrere wählen)', type: 'multi', options: FAECHER },
  { id: 'franzNiveau', q: 'Wie gut ist dein Französisch?', type: 'single', options: NIVEAUS },
  { id: 'spanNiveau', q: 'Wie gut ist dein Spanisch?', type: 'single', options: NIVEAUS },
  { id: 'englNiveau', q: 'Wie gut ist dein Englisch?', type: 'single', options: NIVEAUS },
  { id: 'noten', q: 'Wie sind deine Noten im Moment ungefähr?', type: 'single', options: ['Sehr gut (1)', 'Gut (2)', 'Befriedigend (3)', 'Ausreichend (4)', 'Schwach (5–6)', 'Sehr unterschiedlich'] },
  { id: 'ziel', q: 'Was ist dein wichtigstes Ziel?', type: 'single', options: ['Bessere Noten', 'Abitur schaffen', 'Ein Fach aufholen', 'Prüfungen bestehen', 'Deutsch verbessern', 'Mehr verstehen, nicht nur auswendig lernen'] },
  { id: 'lernstil', q: 'Wie lernst du am besten? (Mehrere wählen)', type: 'multi', options: ['Hören (Audio)', 'Sehen (Bilder, Grafiken)', 'Lesen', 'Schreiben', 'Üben mit Aufgaben', 'Jemandem erklären'] },
  { id: 'erklaerArt', q: 'Wie soll ich erklären?', type: 'single', options: ['Sehr einfach, Schritt für Schritt', 'Kurz und direkt', 'Ausführlich mit Hintergrund', 'Mit vielen Beispielen aus dem Alltag'] },
  { id: 'lernzeit', q: 'Wie viel Zeit hast du pro Tag zum Lernen?', type: 'single', options: ['15 Minuten', '30 Minuten', '1 Stunde', '2 Stunden', 'Mehr als 2 Stunden'] },
  { id: 'tageszeit', q: 'Wann lernst du am liebsten?', type: 'single', options: ['Morgens', 'Mittags', 'Nachmittags', 'Abends', 'Nachts', 'Unterschiedlich'] },
  { id: 'konzentration', q: 'Wie lange kannst du dich gut konzentrieren?', type: 'single', options: ['10 Minuten', '20 Minuten', '30 Minuten', '45 Minuten', '1 Stunde oder mehr'] },
  { id: 'pruefungsangst', q: 'Hast du Stress oder Angst vor Prüfungen?', type: 'single', options: ['Nein', 'Ein bisschen', 'Ja, oft', 'Ja, sehr stark'] },
  { id: 'probleme', q: 'Was ist beim Lernen schwer für dich? (Mehrere wählen)', type: 'multi', options: ['Schwere Wörter verstehen', 'Mich motivieren', 'Mich konzentrieren', 'Mir Dinge merken', 'Aufgaben richtig lesen', 'Zeit planen', 'Mathe-Formeln', 'Texte schreiben'] },
  { id: 'pruefungen', q: 'Hast du bald Klassenarbeiten oder Prüfungen? Schreib Fach und Datum.', type: 'text', placeholder: 'z. B. Mathe am 20.10., Chemie am 5.11.', optional: true },
  { id: 'hobbys', q: 'Was sind deine Hobbys? (Damit ich passende Beispiele finde.)', type: 'text', placeholder: 'z. B. Fußball, Gaming, Musik', optional: true },
  { id: 'beruf', q: 'Was möchtest du später beruflich machen?', type: 'text', placeholder: 'z. B. Ingenieur, Arzt, weiß noch nicht', optional: true },
  { id: 'hilfsmittel', q: 'Welchen Taschenrechner benutzt du in der Schule?', type: 'text', placeholder: 'z. B. Casio fx-991DE X, TI-Nspire', optional: true },
  { id: 'motivation', q: 'Was motiviert dich am meisten?', type: 'single', options: ['Lob und Erfolge sehen', 'Klare Ziele', 'Wettbewerb und Punkte', 'Wissen, wofür ich es brauche', 'Kleine Belohnungen'] },
  { id: 'tonfall', q: 'Wie soll ich mit dir reden?', type: 'single', options: ['Locker wie ein Freund', 'Freundlich wie ein Lehrer', 'Kurz und sachlich'] },
  { id: 'sonstiges', q: 'Gibt es noch etwas, das ich über dich wissen soll?', type: 'text', placeholder: 'Alles, was dir wichtig ist', optional: true },
];

// Macht aus den Antworten einen Text für die KI.
export function profileText(answers) {
  return QUESTIONS
    .filter(q => answers[q.id] !== undefined && answers[q.id] !== '' && !(Array.isArray(answers[q.id]) && !answers[q.id].length))
    .map(q => {
      const v = Array.isArray(answers[q.id]) ? answers[q.id].join(', ') : answers[q.id];
      const label = q.q.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[👋]/g, '').trim();
      return `- ${label} → ${v}`;
    })
    .join('\n');
}
