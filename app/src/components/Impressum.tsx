import { Link } from "react-router-dom";

const CONTACT_EMAIL = "support@yogaswap.de";
const APP_URL = "https://app.yogaswap.de";
const DEMO_URL = "https://demo.yogaswap.de";

export default function Impressum() {
  return (
    <div className="legal-page">
      <p className="legal-back">
        <Link to="/">← YogaSwap</Link>
      </p>
      <h1>Impressum</h1>
      <p className="muted small">
        Angaben gemäß § 5 TMG (Telemediengesetz)
      </p>

      <section>
        <h2>Anbieter / Verantwortlich für die Inhalte</h2>
        <p>
          Karin Schrader<br />
          Zum Ackerberg 35<br />
          38126 Braunschweig
        </p>
      </section>

      <section>
        <h2>Angebot</h2>
        <p>
          YogaSwap (Produktion):{" "}
          <a href={APP_URL} target="_blank" rel="noopener noreferrer">
            {APP_URL}
          </a>
        </p>
        <p>
          Öffentliche Demo:{" "}
          <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
            {DEMO_URL}
          </a>
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <section>
        <h2>Umsatzsteuer</h2>
        <p>
          Es wird keine Umsatzsteuer-ID geführt (Kleinunternehmer gemäß § 19 UStG).
        </p>
      </section>

      <section>
        <h2>Haftung für Inhalte</h2>
        <p>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten verantwortlich. Für die Inhalte verlinkter externer Seiten übernehmen wir keine Haftung.
        </p>
      </section>

      <nav className="legal-nav">
        <Link to="/">Zur Startseite</Link>
        <span className="sep">·</span>
        <Link to="/datenschutz">Datenschutz</Link>
        <span className="sep">·</span>
        <Link to="/open-source-lizenzen">Open-Source-Lizenzen</Link>
      </nav>
    </div>
  );
}
