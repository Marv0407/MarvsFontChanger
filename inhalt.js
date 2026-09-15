// Content-Script: stellt beim Laden einer Seite die für diese Domain
// gespeicherte Schriftart/-größe wieder her (siehe manifest.json).
// Ohne gespeicherten Eintrag für die Domain passiert nichts.

const STIL_ELEMENT_ID = "font-changer-stil";
const GROESSEN_ATTRIBUT = "data-fc-basisgroesse";

// Muss mit der Liste in popup.js übereinstimmen
const CUSTOM_SCHRIFTEN = {
  OpenDyslexic: {
    dateiname: "OpenDyslexic-Regular.otf",
    format: "opentype",
  },
};

function aktuelleDomainErmitteln() {
  return window.location.hostname;
}

function schriftAufSeiteAnwenden(typ, schriftName, customConfig, groessenstufe) {
  const alterStil = document.getElementById(STIL_ELEMENT_ID);
  if (alterStil) alterStil.remove();

  const style = document.createElement("style");
  style.id = STIL_ELEMENT_ID;

  let schriftRegelName = schriftName;

  if (typ === "CUSTOM" && customConfig) {
    style.textContent = `
      @font-face {
        font-family: '${customConfig.name}';
        src: url('${customConfig.url}') format('${customConfig.format}');
      }
    `;
    schriftRegelName = customConfig.name;
  }

  document.head.appendChild(style);

  document.querySelectorAll("*").forEach((element) => {
    element.style.setProperty("font-family", `${schriftRegelName}, sans-serif`, "important");
  });

  const alleElemente = document.querySelectorAll("*");

  // erst Basisgrößen einfrieren, dann setzen (siehe popup.js)
  alleElemente.forEach((element) => {
    if (element.getAttribute(GROESSEN_ATTRIBUT) === null) {
      const basisgroesse = parseFloat(getComputedStyle(element).fontSize);
      if (!Number.isNaN(basisgroesse)) {
        element.setAttribute(GROESSEN_ATTRIBUT, String(basisgroesse));
      }
    }
  });

  alleElemente.forEach((element) => {
    const basisgroesse = parseFloat(element.getAttribute(GROESSEN_ATTRIBUT));
    if (!Number.isNaN(basisgroesse)) {
      const neueGroesse = Math.max(1, basisgroesse + groessenstufe);
      element.style.setProperty("font-size", `${neueGroesse}px`, "important");
    }
  });
}

function gespeicherteEinstellungFuerDomainLaden() {
  const domain = aktuelleDomainErmitteln();
  if (!domain) return;

  chrome.storage.local.get(["domainEinstellungen"], (ergebnis) => {
    const domainEinstellungen = ergebnis.domainEinstellungen;
    if (!domainEinstellungen) return;

    const einstellung = domainEinstellungen[domain];
    if (!einstellung) return;

    const { schriftartWert, groessenstufe } = einstellung;
    const [typ, schriftName] = schriftartWert.split(":");

    let customConfig = null;
    if (typ === "CUSTOM" && CUSTOM_SCHRIFTEN[schriftName]) {
      const eintrag = CUSTOM_SCHRIFTEN[schriftName];
      customConfig = {
        name: schriftName,
        url: chrome.runtime.getURL(`fonts/${eintrag.dateiname}`),
        format: eintrag.format,
      };
    }

    schriftAufSeiteAnwenden(typ, schriftName, customConfig, groessenstufe);
  });
}

gespeicherteEinstellungFuerDomainLaden();
