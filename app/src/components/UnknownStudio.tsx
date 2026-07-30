import { Link } from "react-router-dom";

type UnknownStudioProps = {
  tenantId: string;
};

/** Fehlerzustand wenn Subdomain / tenantId in Dynamo fehlt (#261). */
export default function UnknownStudio({ tenantId }: UnknownStudioProps) {
  return (
    <section id="main-content" className="main-section unknown-studio" aria-labelledby="unknown-studio-heading">
      <h2 id="unknown-studio-heading">Studio nicht gefunden</h2>
      <p>
        Unter dieser Adresse gibt es kein YogaSwap-Studio
        {tenantId && tenantId !== "unbekannt" ? (
          <>
            {" "}
            (<code>{tenantId}</code>)
          </>
        ) : null}
        .
      </p>
      <p className="muted">
        Prüfe den Link oder öffne die Hauptseite deines Studios. Wenn du denkst, das ist ein Fehler,
        wende dich an den Studio-Admin oder an{" "}
        <a href="mailto:support@yogaswap.de">support@yogaswap.de</a>.
      </p>
      <p>
        <a href="https://app.yogaswap.de">Zur YogaSwap-Hauptseite</a>
        <span className="sep" aria-hidden="true">
          {" "}
          ·{" "}
        </span>
        <Link to="/impressum">Impressum</Link>
      </p>
    </section>
  );
}
