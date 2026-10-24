// Direktverbindung zwischen Handys per WebRTC - ohne Server.
// Verbindungsaufbau ueber Einladungs- und Antwort-Links, die per WhatsApp geteilt werden.
// Nico 24.10.2026: "ohne dass das Ganze extern auf einem Server laufen muss".

const RTC_CONFIG = { iceServers: [] }; // bewusst kein fremder Dienst: im selben WLAN reicht das

async function packen(text) {
  const daten = new TextEncoder().encode(text);
  const strom = new Blob([daten]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(strom).arrayBuffer());
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function entpacken(code) {
  code = code.trim().replace(/-/g, "+").replace(/_/g, "/");
  while (code.length % 4) code += "=";
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(strom).text();
}

function warteAufKandidaten(pc) {
  return new Promise((ok) => {
    if (pc.iceGatheringState === "complete") return ok();
    const fertig = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", fertig);
        ok();
      }
    };
    pc.addEventListener("icegatheringstatechange", fertig);
    setTimeout(ok, 4000); // spaetestens nach 4 s mit dem, was da ist
  });
}

// ---------------------------------------------------------------- Gastgeber
export class Gastgeber {
  constructor(beiNachricht, beiStatus) {
    this.plaetze = {}; // platz -> {pc, kanal, offen}
    this.beiNachricht = beiNachricht;
    this.beiStatus = beiStatus;
  }

  async einladung(platz) {
    const alt = this.plaetze[platz];
    if (alt) try { alt.pc.close(); } catch (e) {}
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const kanal = pc.createDataChannel("spiel", { ordered: true });
    const eintrag = { pc, kanal, offen: false };
    this.plaetze[platz] = eintrag;
    kanal.onopen = () => { eintrag.offen = true; this.beiStatus(platz, "verbunden"); };
    kanal.onclose = () => { eintrag.offen = false; this.beiStatus(platz, "getrennt"); };
    kanal.onmessage = (ev) => this.beiNachricht(platz, JSON.parse(ev.data));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.beiStatus(platz, "fehlgeschlagen");
    };
    await pc.setLocalDescription(await pc.createOffer());
    await warteAufKandidaten(pc);
    return await packen(JSON.stringify({ p: platz, s: pc.localDescription.sdp }));
  }

  async antwortAnnehmen(code) {
    const { p, s } = JSON.parse(await entpacken(code));
    const eintrag = this.plaetze[p];
    if (!eintrag) throw new Error("Zu dieser Antwort gibt es keine offene Einladung.");
    if (eintrag.pc.signalingState !== "have-local-offer") return p; // schon angenommen
    await eintrag.pc.setRemoteDescription({ type: "answer", sdp: s });
    this.beiStatus(p, "verbinde");
    return p;
  }

  senden(platz, nachricht) {
    const e = this.plaetze[platz];
    if (e && e.offen) e.kanal.send(JSON.stringify(nachricht));
  }
}

// ---------------------------------------------------------------- Gast
export class Gast {
  constructor(beiNachricht, beiStatus) {
    this.beiNachricht = beiNachricht;
    this.beiStatus = beiStatus;
    this.kanal = null;
  }

  async antwortZu(einladungsCode) {
    const { p, s } = JSON.parse(await entpacken(einladungsCode));
    this.platz = p;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    pc.ondatachannel = (ev) => {
      this.kanal = ev.channel;
      this.kanal.onopen = () => this.beiStatus("verbunden");
      this.kanal.onclose = () => this.beiStatus("getrennt");
      this.kanal.onmessage = (m) => this.beiNachricht(JSON.parse(m.data));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.beiStatus("fehlgeschlagen");
    };
    await pc.setRemoteDescription({ type: "offer", sdp: s });
    await pc.setLocalDescription(await pc.createAnswer());
    await warteAufKandidaten(pc);
    return await packen(JSON.stringify({ p, s: pc.localDescription.sdp }));
  }

  senden(nachricht) {
    if (this.kanal && this.kanal.readyState === "open") this.kanal.send(JSON.stringify(nachricht));
  }
}
