// Lokale Custom-Schriften, die als Datei mitgeliefert werden
const CUSTOM_SCHRIFTEN = {
  OpenDyslexic: {
    dateiname: "OpenDyslexic-Regular.otf",
    format: "opentype",
  },
};

const STIL_ELEMENT_ID = "font-changer-stil";

const schriftartAuswahl = document.getElementById("schriftartAuswahl");
const systemSchriftenGruppe = document.getElementById("systemSchriftenGruppe");
const groessenSlider = document.getElementById("groessenSlider");
const groessenWert = document.getElementById("groessenWert");
const anwendenButton = document.getElementById("anwendenButton");
const zuruecksetzenButton = document.getElementById("zuruecksetzenButton");
const optionenButton = document.getElementById("optionenButton");
const statusBanner = document.getElementById("statusBanner");

// Ermittelt Tab und Hostname des aktiven Tabs. Domain dient als Key
// für die pro-Domain gespeicherten Einstellungen.
async function aktiverTabUndDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return { tab: null, domain: null };

  try {
    const domain = new URL(tab.url).hostname;
    return { tab, domain };
  } catch {
    // interne Browserseiten (chrome://, edge://) haben keine gültige URL
    return { tab, domain: null };
  }
}

function zeigeStatus(text, art) {
  statusBanner.textContent = text;
  statusBanner.className = `status-banner ${art}`;
  statusBanner.hidden = false;
  window.clearTimeout(zeigeStatus._timer);
  zeigeStatus._timer = window.setTimeout(() => {
    statusBanner.hidden = true;
  }, 2600);
}

function aktualisiereSliderAnzeige() {
  const wert = Number(groessenSlider.value);
  groessenWert.textContent = wert > 0 ? `+${wert}` : String(wert);
}

// Lädt gespeicherte System-Schriften ins Dropdown. Promise-basiert, damit
// domainEinstellungLaden() erst danach auf die Optionen zugreift.
function systemSchriftenAnzeigen() {
  return new Promise((resolve) => {
    if (!systemSchriftenGruppe) {
      resolve();
      return;
    }

    chrome.storage.local.get(["systemFonts"], (ergebnis) => {
      const schriften = ergebnis.systemFonts || [];

      if (schriften.length === 0) {
        systemSchriftenGruppe.innerHTML =
          '<option value="" disabled>Klicke unten auf „Freischalten“</option>';
        resolve();
        return;
      }

      systemSchriftenGruppe.innerHTML = "";
      schriften.forEach((schriftName) => {
        const option = document.createElement("option");
        option.value = `SYSTEM:${schriftName}`;
        option.textContent = schriftName;
        systemSchriftenGruppe.appendChild(option);
      });
      resolve();
    });
  });
}

// Stellt die gespeicherte Einstellung für die übergebene Domain wieder her.
// Muss nach systemSchriftenAnzeigen() aufgerufen werden.
function domainEinstellungLaden(domain) {
  if (!domain) return;

  chrome.storage.local.get(["domainEinstellungen"], (ergebnis) => {
    const domainEinstellungen = ergebnis.domainEinstellungen || {};
    const einstellung = domainEinstellungen[domain];
    if (!einstellung) return;

    const vorhanden = Array.from(schriftartAuswahl.options).some(
      (opt) => opt.value === einstellung.schriftartWert,
    );
    if (vorhanden) {
      schriftartAuswahl.value = einstellung.schriftartWert;
    }

    if (typeof einstellung.groessenstufe === "number") {
      groessenSlider.value = String(einstellung.groessenstufe);
      aktualisiereSliderAnzeige();
    }
  });
}

// Wird per chrome.scripting im Ziel-Tab ausgeführt
function wendeSchriftAnImTab(typ, schriftName, customConfig, groessenstufe, stilId) {
  const alterStil = document.getElementById(stilId);
  if (alterStil) alterStil.remove();

  const style = document.createElement("style");
  style.id = stilId;

  let schriftRegel = `font-family: '${schriftName}', sans-serif !important;`;

  if (typ === "CUSTOM" && customConfig) {
    style.textContent = `
      @font-face {
        font-family: '${customConfig.name}';
        src: url('${customConfig.url}') format('${customConfig.format}');
      }
    `;
    schriftRegel = `font-family: '${customConfig.name}', sans-serif !important;`;
  }

  document.head.appendChild(style);

  // Schriftart auf alle Elemente anwenden
  document.querySelectorAll("*").forEach((element) => {
    element.style.setProperty(
      "font-family",
      schriftRegel.replace("font-family: ", "").replace(" !important;", ""),
      "important",
    );
  });

  // Größe relativ zur ursprünglichen Elementgröße verschieben, in zwei
  // Durchläufen: erst alle Basisgrößen einfrieren, dann setzen. Sonst
  // erben Kinder mit em/%-Einheiten bereits die neue Elterngröße.
  const GROESSEN_ATTRIBUT = "data-fc-basisgroesse";
  const alleElemente = document.querySelectorAll("*");

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

// Setzt die Erweiterung im Tab auf den Ausgangszustand zurück
function setzeSchriftZurueckImTab(stilId) {
  const stil = document.getElementById(stilId);
  if (stil) stil.remove();

  const GROESSEN_ATTRIBUT = "data-fc-basisgroesse";
  document.querySelectorAll("*").forEach((element) => {
    element.style.removeProperty("font-family");
    element.style.removeProperty("font-size");
    element.removeAttribute(GROESSEN_ATTRIBUT);
  });
}

async function schriftAufSeiteAnwenden() {
  const selectWert = schriftartAuswahl.value;
  if (!selectWert) {
    zeigeStatus("Bitte zuerst eine Schriftart auswählen.", "fehler");
    return;
  }

  const [typ, schriftName] = selectWert.split(":");
  const groessenstufe = Number(groessenSlider.value);

  const { tab, domain } = await aktiverTabUndDomain();
  if (!tab) {
    zeigeStatus("Kein aktiver Tab gefunden.", "fehler");
    return;
  }
  if (!domain) {
    zeigeStatus("Auf dieser Seite nicht verfügbar.", "fehler");
    return;
  }

  let customConfig = null;
  if (typ === "CUSTOM" && CUSTOM_SCHRIFTEN[schriftName]) {
    const eintrag = CUSTOM_SCHRIFTEN[schriftName];
    customConfig = {
      name: schriftName,
      url: chrome.runtime.getURL(`fonts/${eintrag.dateiname}`),
      format: eintrag.format,
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: wendeSchriftAnImTab,
      args: [typ, schriftName, customConfig, groessenstufe, STIL_ELEMENT_ID],
    });

    // Für Domain speichern, damit inhalt.js sie bei künftigen Aufrufen
    // dieser Seite wiederherstellen kann.
    chrome.storage.local.get(["domainEinstellungen"], (ergebnis) => {
      const domainEinstellungen = ergebnis.domainEinstellungen || {};
      domainEinstellungen[domain] = { schriftartWert: selectWert, groessenstufe };
      chrome.storage.local.set({ domainEinstellungen });
    });

    zeigeStatus(`Für ${domain} gespeichert ✓`, "erfolg");
  } catch (fehler) {
    console.error(fehler);
    zeigeStatus("Konnte auf dieser Seite nicht angewendet werden.", "fehler");
  }
}

async function schriftZuruecksetzen() {
  const { tab, domain } = await aktiverTabUndDomain();
  if (!tab) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: setzeSchriftZurueckImTab,
      args: [STIL_ELEMENT_ID],
    });

    groessenSlider.value = "0";
    aktualisiereSliderAnzeige();

    if (domain) {
      chrome.storage.local.get(["domainEinstellungen"], (ergebnis) => {
        const domainEinstellungen = ergebnis.domainEinstellungen || {};
        delete domainEinstellungen[domain];
        chrome.storage.local.set({ domainEinstellungen });
      });
    }

    zeigeStatus("Zurückgesetzt ✓", "erfolg");
  } catch (fehler) {
    console.error(fehler);
    zeigeStatus("Zurücksetzen fehlgeschlagen.", "fehler");
  }
}

// Event-Listener registrieren
document.addEventListener("DOMContentLoaded", async () => {
  await systemSchriftenAnzeigen();
  const { domain } = await aktiverTabUndDomain();
  domainEinstellungLaden(domain);
  aktualisiereSliderAnzeige();
});

groessenSlider.addEventListener("input", aktualisiereSliderAnzeige);
anwendenButton.addEventListener("click", schriftAufSeiteAnwenden);
zuruecksetzenButton.addEventListener("click", schriftZuruecksetzen);
optionenButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
