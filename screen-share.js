/*
 * Screen Share (test): shows a screen, window or tab that someone shares from a computer.
 *
 *   <bs-snippet name="screen-share" script="https://YOUR-HOST/screen-share.js" position="x y z" ...>
 *
 * The screen shows a code and an address. On a computer, open the address (share.html, hosted
 * next to this file), type the code and press Share screen. The picture goes straight from that
 * computer to every screen in the room (no relay yet: good for small groups).
 */
(() => {
  const EL = document.querySelector('bs-snippet[name="screen-share"]') ||
    [...document.querySelectorAll("bs-snippet")].find((e) => /screen-share(\.min)?\.js(\?|$)/.test(e.getAttribute("script") || ""));
  if (!EL) return;
  const attr = (n, d) => { const v = EL.getAttribute(n); return v === null || v === "" ? d : v; };
  const num = (n, d, lo, hi) => { const v = parseFloat(attr(n, "")); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const vec3 = (n, d) => { const a = String(attr(n, "")).trim().split(/\s+/).map(Number); return a.length === 3 && a.every(isFinite) ? a : d; };
  const POS = vec3("position", [0, 2, 3]), ROT = vec3("rotation", [0, 0, 0]);
  const WIDTH = num("width", 3, 0.5, 20), KEY = String(attr("channel", "ss")).replace(/[^A-Za-z0-9_-]/g, "") || "ss";
  const fullAt = num("full-volume-distance", 5, 0, 500), silentAt = Math.max(fullAt + 0.5, num("silence-distance", 15, 0, 1000));
  const startVol = num("volume", 60, 0, 100) / 100;
  const SRC = (document.currentScript && document.currentScript.src) ||
    ([...document.scripts].map((s) => s.src).find((s) => /screen-share(\.min)?\.js/.test(s)) || "");
  const VIEWER = attr("viewer", "") || (SRC ? new URL("viewer.html", SRC).href : "");
  if (!/^https?:/.test(VIEWER)) { console.warn("[Screen share] can't find viewer.html"); return; }
  const newCode = () => { const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let c = ""; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; };

  window.addEventListener("bs-loaded", () => {
    const scene = BS.Scene.GetInstance();
    let code = "", browser = null, shownCode = "";
    const show = () => { if (browser && code && code !== shownCode) { shownCode = code; browser.url = VIEWER + "#code=" + code; } };
    scene.On("space-state-changed", (e) => {
      for (const ch of e.detail.changes) if (ch.property === KEY + "_code" && ch.newValue) { code = ch.newValue; show(); }
    });
    // The room's code: whoever arrives to an empty room makes one; everyone after uses it
    setTimeout(() => {
      const others = Object.keys(scene.users || {}).filter((u) => !scene.localUser || u !== scene.localUser.uid).length;
      if (!code || !others) { code = code && others ? code : newCode(); scene.SetPublicSpaceProps({ [KEY + "_code"]: code }); }
      show();
    }, 3000);

    scene.On("unity-loaded", async () => {
      const anchor = new BS.GameObject({ name: "ScreenShare", localPosition: new BS.Vector3(POS[0], POS[1], POS[2]),
                                         localEulerAngles: new BS.Vector3(ROT[0], ROT[1], ROT[2]) });
      const screen = new BS.GameObject({ name: "ScreenShareScreen", parent: anchor, localPosition: new BS.Vector3(0, 0, 0),
                                         localScale: new BS.Vector3(WIDTH / (1920 / 1300), WIDTH / (1920 / 1300), 1) });
      browser = await screen.AddComponent(new BS.Browser({ url: "about:blank", pageWidth: 1920, pageHeight: 1080 }));
      try { browser.pageWidth = 1920; browser.pageHeight = 1080; browser.ToggleInteraction(false); } catch (e) {}
      show();
      screen.On("browser-message", (e) => {          // status, for troubleshooting
        let m; try { m = JSON.parse(e.detail); } catch (err) { return; }
        if (m && m.from === "ss" && m.state !== screen._last) { screen._last = m.state; console.log("[Screen share] " + m.state + (m.w ? " " + m.w + "x" + m.h : "") + (m.audio ? " with sound" : "")); }
      });
      // Sound fades with distance from the screen
      let factor = 1, sent = -1;
      scene.On("pose-update", (e) => {
        const hd = e.detail && e.detail.head; const h = hd && (hd.position || (hd.x !== undefined ? hd : null));
        if (!h) return;
        const d = Math.sqrt((h.x - POS[0]) ** 2 + (h.y - POS[1]) ** 2 + (h.z - POS[2]) ** 2);
        const v = Math.max(0, Math.min(1, 1 - (d - fullAt) / (silentAt - fullAt))); factor = v * v;
      });
      setInterval(() => {
        const want = Math.round(startVol * factor * 100) / 100;
        if (Math.abs(want - sent) < 0.01) return;
        sent = want;
        browser.RunActions(JSON.stringify({ actions: [{ actionType: "runscript", strParam1: "window.__ssVol&&window.__ssVol(" + want + ")" }] }));
      }, 250);
    });
  });
})();
