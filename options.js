const freischaltenButton = document.getElementById("freischaltenButton");
const statusText = document.getElementById("statusText");

function zeigeStatus(text, art) {
  statusText.textContent = text;
  statusText.className = "status-text" + (art ? ` ${art}` : "");
}

async function schriftenLaden() {
  if (!window.queryLocalFonts) {
    zeigeStatus(
      "Dein Chrome unterstützt diese Funktion leider nicht.",
      "fehler",
    );
    return;
  }

  freischaltenButton.disabled = true;
  zeigeStatus("Frage Berechtigung an …");

  try {
    // Hier öffnet Chrome das offizielle Berechtigungsfenster
    const verfuegbareSchriften = await window.queryLocalFonts();

    if (verfuegbareSchriften.length === 0) {
      zeigeStatus("Keine Schriftarten gefunden.", "fehler");
      return;
    }

    // Duplikate entfernen und alphabetisch sortieren
    const eindeutigeSchriften = Array.from(
      new Set(verfuegbareSchriften.map((schrift) => schrift.fullName)),
    ).sort((a, b) => a.localeCompare(b, "de"));

    // Im Chrome-Speicher ablegen, damit das Popup sie lesen kann
    await chrome.storage.local.set({ systemFonts: eindeutigeSchriften });

    zeigeStatus(
      `Erfolgreich! ${eindeutigeSchriften.length} Schriften geladen. Du kannst diesen Tab jetzt schließen.`,
      "erfolg",
    );
  } catch (fehler) {
    console.error(fehler);
    zeigeStatus("Zugriff verweigert oder abgebrochen.", "fehler");
  } finally {
    freischaltenButton.disabled = false;
  }
}

freischaltenButton.addEventListener("click", schriftenLaden);
