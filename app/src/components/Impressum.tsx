import { Link } from "react-router-dom";

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
          YogaSwap ist erreichbar unter:{" "}
          <a href="https://demo.yogaswap.de" target="_blank" rel="noopener noreferrer">
            https://demo.yogaswap.de
          </a>
        </p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail: kaschra@online.de
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
