import { useEffect, useState } from "react";
import { isLayoutDebugEnabled } from "../lib/layoutDebugFlag";

type LayoutSnapshot = {
  scale: number;
  layoutWidth: number;
  clientWidth: number;
  innerWidth: number;
  vvWidth: number;
  scrollX: number;
  dpr: number;
  overflow: boolean;
  overflowNote: string;
  offenders: string;
  uaShort: string;
};

function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  for (let i = 0; i < 4 && node && node.nodeType === 1; i += 1) {
    const tag = node.tagName.toLowerCase();
    const id = node.id ? `#${node.id}` : "";
    const cls =
      typeof node.className === "string" && node.className.trim()
        ? `.${node.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
    parts.unshift(`${tag}${id}${cls}`);
    node = node.parentElement;
  }
  return parts.join(">");
}

/** Elemente, die über die Layout-Viewport-Breite hinausragen (fixed Banner ausnehmen). */
function findHorizontalOffenders(limitPx: number, max = 3): string {
  const rootRight = limitPx + 1;
  const hits: { right: number; path: string }[] = [];
  const all = document.body?.querySelectorAll("*");
  if (!all) return "—";

  all.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest(".layout-debug-banner")) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (rect.right <= rootRight) return;
    hits.push({ right: Math.round(rect.right), path: cssPath(node) });
  });

  hits.sort((a, b) => b.right - a.right);
  const top = hits.slice(0, max);
  if (top.length === 0) return "keine";
  return top.map((h) => `${h.path}→${h.right}`).join(" | ");
}

function readSnapshot(): LayoutSnapshot {
  const docEl = document.documentElement;
  const layoutWidth = Math.round(docEl.scrollWidth);
  const clientWidth = Math.round(docEl.clientWidth);
  const innerWidth = Math.round(window.innerWidth);
  const vvWidth = Math.round(window.visualViewport?.width ?? innerWidth);
  const scrollX = Math.round(window.scrollX || docEl.scrollLeft || 0);
  const scale =
    typeof window.visualViewport?.scale === "number"
      ? Math.round(window.visualViewport.scale * 100) / 100
      : 1;
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;

  // clientWidth auf Android oft ≠ innerWidth (Quatsch-Scrollbar). Inhalt vs. Layout-Viewport:
  const contentOverflow = layoutWidth > innerWidth + 8;
  const zoomed = scale > 1.05 || scale < 0.95;
  const scrolledX = Math.abs(scrollX) > 2;
  const overflow = contentOverflow || zoomed || scrolledX;
  const overflowNote = contentOverflow
    ? "Inhalt>Viewport"
    : zoomed
      ? "Zoom≠1"
      : scrolledX
        ? "scrollX"
        : clientWidth + 8 < innerWidth
          ? "nur clientW-Quirk"
          : "ok";

  const offenders = contentOverflow || scrolledX ? findHorizontalOffenders(innerWidth) : "—";
  const ua = navigator.userAgent || "";
  const uaShort = ua.length > 72 ? `${ua.slice(0, 69)}…` : ua;
  return {
    scale,
    layoutWidth,
    clientWidth,
    innerWidth,
    vvWidth,
    scrollX,
    dpr,
    overflow,
    overflowNote,
    offenders,
    uaShort,
  };
}

/**
 * Temporärer Diagnosehinweis für #409 (Android-Layout).
 * Staging/DEV oder ?layoutDebug=1 — per „Schließen“ für die Session ausblendbar.
 */
export default function LayoutDebugBanner() {
  const [enabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return isLayoutDebugEnabled();
  });
  const [dismissed, setDismissed] = useState(false);
  const [snap, setSnap] = useState<LayoutSnapshot | null>(null);

  useEffect(() => {
    if (!enabled || dismissed) return;

    const update = () => setSnap(readSnapshot());
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    const id = window.setInterval(update, 1500);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.clearInterval(id);
    };
  }, [enabled, dismissed]);

  if (!enabled || dismissed || !snap) return null;

  return (
    <aside
      className={`layout-debug-banner${snap.overflow ? " is-warn" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="layout-debug-banner-title">Layout-Check #409 — bitte Screenshot senden</div>
      <pre className="layout-debug-banner-body">
        {`Zoom: ${snap.scale}  dpr: ${snap.dpr}  scrollX: ${snap.scrollX}
scrollW/inner/client/vv: ${snap.layoutWidth}/${snap.innerWidth}/${snap.clientWidth}/${snap.vvWidth}
Overflow?: ${snap.overflow ? "JA" : "nein"} (${snap.overflowNote})
Täter: ${snap.offenders}
UA: ${snap.uaShort}`}
      </pre>
      <button type="button" className="layout-debug-banner-close" onClick={() => setDismissed(true)}>
        Schließen
      </button>
    </aside>
  );
}
