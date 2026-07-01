import { Link } from "react-router-dom";

export default function Datenschutz() {
  return (
    <div className="legal-page">
      <p className="legal-back">
        <Link to="/">← YogaSwap</Link>
      </p>
      <h1>Datenschutzerklärung</h1>

      <section>
        <h2>1. Verantwortlicher</h2>
        <p>
          Karin Schrader<br />
          Zum Ackerberg 35<br />
          38126 Braunschweig<br />
          E-Mail: kaschra@online.de
        </p>
      </section>

      <section>
        <h2>2. Erhobene Daten und Zweck</h2>
        <p>
          Beim Nutzen von YogaSwap werden Anmeldedaten (z. B. E-Mail, Anzeigename) und kursbezogene Daten (Terminbuchungen, Tauschanfragen) verarbeitet. Zweck ist die Bereitstellung der Kurs- und Tauschfunktion.
        </p>
      </section>

      <section>
        <h2>3. Rechtsgrundlage</h2>
        <p>
          Die Verarbeitung erfolgt auf Grundlage Ihrer Einwilligung bzw. zur Vertragserfüllung (Art. 6 Abs. 1 lit. a, b DSGVO).
        </p>
      </section>

      <section>
        <h2>4. Hosting, Anmeldung und Speicherort</h2>
        <p>
          Die Anwendung wird über Amazon CloudFront und AWS bereitgestellt und ist unter{" "}
          <a href="https://demo.yogaswap.de" target="_blank" rel="noopener noreferrer">
            https://demo.yogaswap.de
          </a>{" "}
          erreichbar. Dabei können technisch bedingt Verbindungsdaten (IP, Zeitpunkt) an den Betreiber übermittelt werden.
        </p>
        <p>
          Für Anmeldung und Kontenverwaltung nutzt YogaSwap den Dienst Amazon Cognito (Teil der AWS-Cloud). Dabei werden E-Mail, Anzeigename und Zugangsdaten bei AWS verarbeitet. Kurs- und Tauschdaten werden in der Datenbank DynamoDB (AWS) gespeichert. Die Speicherorte können außerhalb der EU liegen (USA u. a.); AWS bietet hierzu vertragliche Garantien (Auftragsverarbeitung).
        </p>
      </section>

      <section>
        <h2>5. Speicherdauer</h2>
        <p>
          Personenbezogene Daten werden nur so lange gespeichert, wie es für den genannten Zweck nötig ist oder gesetzliche Aufbewahrungsfristen bestehen.
        </p>
      </section>

      <section>
        <h2>6. Ihre Rechte</h2>
        <p>
          Sie haben ein Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit (soweit anwendbar). Wenden Sie sich dazu an die im Impressum genannte Kontaktadresse. Sie haben zudem das Recht, sich bei einer Aufsichtsbehörde zu beschweren.
        </p>
      </section>

      <section>
        <h2>7. Änderungen</h2>
        <p>
          Diese Datenschutzerklärung kann angepasst werden. Die aktuelle Version finden Sie auf dieser Seite.
        </p>
      </section>

      <nav className="legal-nav">
        <Link to="/">Zur Startseite</Link>
        <span className="sep">·</span>
        <Link to="/impressum">Impressum</Link>
        <span className="sep">·</span>
        <Link to="/open-source-lizenzen">Open-Source-Lizenzen</Link>
      </nav>
    </div>
  );
}
