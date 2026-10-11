// Сервер-посредник для «Im A Slime» на Cloudflare Workers.
// Телефон хозяина подключается к /host?room=N, игроки из браузера — к /play?room=N.
// Каждая комната — отдельный «Durable Object», который пересылает сообщения между хозяином и игроками.
// Протокол тот же, что и у сервера на Deno, поэтому игру менять не нужно.

const PAGE = `<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover'><meta name=apple-mobile-web-app-capable content=yes><meta name=apple-mobile-web-app-status-bar-style content=black><title>Im A Slime</title><style>html,body{margin:0;height:100%;background:#0d1620;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;font-family:-apple-system,Roboto,sans-serif;color:#e8f4ff}canvas{position:fixed;left:0;top:0;width:100%;height:100%;touch-action:none}#start{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#0d1620;padding:12px;text-align:center}input,button{font-size:18px;padding:10px 14px;border-radius:10px;border:none}input{background:#22323e;color:#fff;text-align:center;width:220px}button{background:#2f7fb8;color:#fff;font-weight:bold}.sw{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:330px}.sw div{width:34px;height:34px;border-radius:50%;border:3px solid transparent}.sw div.sel{border-color:#fff}small{color:#7f95a6;max-width:420px}#rot{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:#0d1620;font-size:20px;text-align:center;padding:20px}@media (orientation:portrait){#rot{display:flex}}#msg{position:fixed;left:0;right:0;top:40%;text-align:center;font-size:16px;color:#e07070;pointer-events:none}</style></head><body><canvas id=c></canvas><div id=start><h2 style='margin:0'>Im A Slime</h2><input id=nm maxlength=16 placeholder='Имя слизи'><div class=sw id=sw></div><button id=go>Войти в мир</button><small id=rm></small><small>Для полного экрана: «Поделиться» → «На экран Домой» и запускайте оттуда.</small></div><div id=rot>Поверните телефон горизонтально</div><div id=msg></div><script>const P=['#5BBDF2','#6FD07A','#F08AB4','#A88AF0','#F0C850','#E87878','#5AD8D0','#F0A060','#EEF4FA','#5E5E80'];let color=+(localStorage.c||0),ws=null,busy=false;const cv=document.getElementById('c'),ctx=cv.getContext('2d');const sw=document.getElementById('sw'),nm=document.getElementById('nm'),st=document.getElementById('start'),msg=document.getElementById('msg');nm.value=localStorage.n||'';{const q=new URLSearchParams(location.search).get('room');document.getElementById('rm').textContent=q?'Комната '+q:'В ссылке нет номера комнаты — попросите у хозяина полную ссылку';}function drawSw(){sw.innerHTML='';P.forEach((c,i)=>{const d=document.createElement('div');d.style.background=c;if(i===color)d.className='sel';d.onclick=()=>{color=i;drawSw();};sw.appendChild(d);});}drawSw();function send(s){if(ws&&ws.readyState===1)ws.send(s);}function resize(){const d=window.devicePixelRatio||1;cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';const w=Math.round(innerWidth*d),h=Math.round(innerHeight*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}}resize();let rz=null;window.addEventListener('resize',()=>{resize();clearTimeout(rz);rz=setTimeout(()=>send('r|'+innerWidth+'|'+innerHeight),400);});function draw(b){if(busy)return;busy=true;const u=URL.createObjectURL(b);const im=new Image();im.onload=()=>{resize();ctx.drawImage(im,0,0,cv.width,cv.height);URL.revokeObjectURL(u);busy=false;};im.onerror=()=>{URL.revokeObjectURL(u);busy=false;};im.src=u;}function onText(t){const a=t.split('|');if(a[0]==='n'){localStorage.c=a[1];localStorage.n=a.slice(2).join('|');color=+a[1];nm.value=localStorage.n;drawSw();return;}if(a[0]==='p'){setTimeout(()=>{const r=prompt(a[1]||'',a.slice(2).join('|'));send(r===null?'c':'s|'+r);},50);}}document.getElementById('go').onclick=()=>{let n=nm.value.trim()||'Слизь';localStorage.n=n;localStorage.c=color;ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/play'+location.search);ws.binaryType='blob';ws.onopen=()=>{send('hello|'+n.replace(/\\|/g,' ')+'|'+color+'|'+innerWidth+'|'+innerHeight);st.style.display='none';msg.textContent='';};ws.onmessage=e=>{if(typeof e.data==='string')onText(e.data);else draw(e.data);};ws.onclose=()=>{msg.textContent='Соединение с хозяином потеряно. Обновите страницу.';st.style.display='flex';};};function pt(t){const r=cv.getBoundingClientRect();return ((t.clientX-r.left)/r.width).toFixed(4)+'|'+((t.clientY-r.top)/r.height).toFixed(4);}function tch(kind){return e=>{e.preventDefault();for(const t of e.changedTouches)send('t|'+kind+'|'+t.identifier+'|'+pt(t));};}cv.addEventListener('touchstart',tch(0),{passive:false});cv.addEventListener('touchmove',tch(1),{passive:false});cv.addEventListener('touchend',tch(2),{passive:false});cv.addEventListener('touchcancel',tch(2),{passive:false});let md=false;cv.addEventListener('mousedown',e=>{md=true;send('t|0|-1|'+pt(e));});cv.addEventListener('mousemove',e=>{if(md)send('t|1|-1|'+pt(e));});window.addEventListener('mouseup',e=>{if(md){md=false;send('t|2|-1|'+pt(e));}});document.addEventListener('gesturestart',e=>e.preventDefault());</script></body></html>`;


export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
  }

  hostSocket() {
    const h = this.ctx.getWebSockets("host");
    return h.length ? h[0] : null;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Нужен WebSocket", { status: 426 });
    }
    if (url.pathname === "/host") {
      // новый хозяин заменяет старого, все игроки отключаются
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(1000, "host replaced"); } catch (_) { /* */ }
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ["host"]);
      server.serializeAttachment({ role: "host" });
      return new Response(null, { status: 101, webSocket: client });
    }
    // игрок
    const host = this.hostSocket();
    if (!host) return new Response("Комната не найдена: хозяин не в сети", { status: 404 });
    const players = this.ctx.getWebSockets("player");
    if (players.length >= 7) return new Response("Комната заполнена", { status: 503 });
    let id = 1;
    for (const p of players) {
      const a = p.deserializeAttachment();
      if (a && a.id >= id) id = a.id + 1;
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ["player", "p" + id]);
    server.serializeAttachment({ role: "player", id });
    try { host.send("J|" + id); } catch (_) { /* */ }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    const a = ws.deserializeAttachment() || {};
    if (a.role === "host") {
      if (typeof msg !== "string") {
        // картинка: первые 4 байта — номер игрока
        const id = new DataView(msg).getUint32(0);
        const p = this.ctx.getWebSockets("p" + id)[0];
        if (p) try { p.send(msg.slice(4)); } catch (_) { /* */ }
        return;
      }
      if (msg.startsWith("K|")) {
        const p = this.ctx.getWebSockets("p" + Number(msg.slice(2)))[0];
        if (p) try { p.close(1000, "kicked"); } catch (_) { /* */ }
        return;
      }
      const bar = msg.indexOf("|");
      if (bar < 0) return;
      const p = this.ctx.getWebSockets("p" + Number(msg.slice(0, bar)))[0];
      if (p) try { p.send(msg.slice(bar + 1)); } catch (_) { /* */ }
      return;
    }
    // от игрока — хозяину
    const host = this.hostSocket();
    if (host) try { host.send("M|" + a.id + "|" + String(msg)); } catch (_) { /* */ }
  }

  async webSocketClose(ws, code, reason) {
    const a = ws.deserializeAttachment() || {};
    if (a.role === "host") {
      for (const p of this.ctx.getWebSockets("player")) {
        try { p.close(1000, "host left"); } catch (_) { /* */ }
      }
    } else {
      const host = this.hostSocket();
      if (host) try { host.send("L|" + a.id); } catch (_) { /* */ }
    }
    try { ws.close(1000, "bye"); } catch (_) { /* */ }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011, "error");
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const room = url.searchParams.get("room") || "";
    if ((url.pathname === "/host" || url.pathname === "/play") && room) {
      // одна и та же комната всегда попадает в один и тот же объект
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(req);
    }
    if (url.pathname === "/") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response("Im A Slime relay", { status: 404 });
  },
};
