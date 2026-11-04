export const metadata = {title:'Datenschutz | Martenwatch'};

export default function PrivacyPage() {
  return <main className="privacy-page">
    <a href="/">← Zur Übersicht</a>
    <h1>Datenschutz im lokalen Prototyp</h1>
    <p>Diese Hinweise beschreiben die lokale Demo. Sie sind keine vollständige Datenschutzerklärung für einen späteren öffentlichen Dienst.</p>
    <h2>Welche Daten werden verarbeitet?</h2>
    <p>Die Demo speichert eingegebene Lieferantennamen, Beträge, Status und Ereignisse lokal in SQLite. Bitte verwende ausschließlich erfundene Daten. Wer Zugriff auf diese Datenbank oder die laufende Demo hat, kann die gespeicherten Einträge sehen.</p>
    <h2>Messwerte und Tracking</h2>
    <p>Die Anwendung erfasst technische Metriken und Traces lokal im Arbeitsspeicher des API-Prozesses. Sie werden beim Neustart gelöscht. In der aktuellen Demo ist kein Analyse- oder Werbetracking und kein Cloud-Telemetrieexport eingerichtet. Für diese optionalen Zwecke wird daher keine Einwilligung abgefragt.</p>
    <h2>KI-Anbieter</h2>
    <p>Foundry ist standardmäßig ausgeschaltet. Wenn ein Betreiber es später ausdrücklich aktiviert und eine Analyse anfordert, werden die dafür vorgesehenen Rechnungsfelder an den konfigurierten Anbieter übermittelt. Verwende keine echten Rechnungen in dieser Demo.</p>
    <h2>Geteilte Nutzung und Alter</h2>
    <p>Die Demo besitzt keine produktive Anmeldung oder nachgewiesene Trennung pro Nutzer. Sie ist nicht für öffentliche oder gemeinsame Nutzung vorgesehen. Eine Altersprüfung ist noch nicht implementiert.</p>
    <h2>Vor einer Veröffentlichung</h2>
    <p>Für einen echten Dienst müssen Verantwortliche, Kontakt, Zwecke, Rechtsgrundlagen, Empfänger, Aufbewahrungsfristen und Betroffenenrechte anhand des tatsächlichen Betriebs ergänzt und rechtlich geprüft werden.</p>
  </main>;
}
