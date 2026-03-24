import { Link } from "react-router-dom";

export default function OpenSourceLicenses() {
  return (
    <div className="legal-page">
      <p className="legal-back">
        <Link to="/">← YogaSwap</Link>
      </p>
      <h1>Open-Source-Lizenzen</h1>

      <section>
        <h2>Verwendete Bibliotheken</h2>
        <p>
          Diese Anwendung nutzt Open-Source-Software. Dazu gehört unter anderem{" "}
          <a href="https://lucide.dev" target="_blank" rel="noopener noreferrer">
            lucide-react
          </a>
          , verwendet unter der MIT-Lizenz.
        </p>
      </section>

      <section>
        <h2>Lizenzhinweis</h2>
        <p>
          Die jeweiligen Lizenzbedingungen gelten entsprechend den Angaben der
          Projektmaintainer. Bei Updates können sich verwendete Bibliotheken und
          Versionen ändern.
        </p>
      </section>

      <nav className="legal-nav">
        <Link to="/">Zur Startseite</Link>
        <span className="sep">·</span>
        <Link to="/impressum">Impressum</Link>
        <span className="sep">·</span>
        <Link to="/datenschutz">Datenschutz</Link>
      </nav>
    </div>
  );
}
