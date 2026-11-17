// Scrawl Worker: serves public/ and the duel rooms. /api/room/<CODE> opens a WebSocket into a
// Room Durable Object that holds at most two players and relays their messages. The first player
// in a room is the host and runs the simulation in the browser; the server never simulates.

export class Room {
  constructor(ctx) { this.ctx = ctx; }

  open() { return this.ctx.getWebSockets().filter(s => s.readyState === 1); }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    const socks = this.open();
    if (socks.length >= 2) {
      this.ctx.acceptWebSocket(server, ['spectator']);
      server.send('{"t":"full"}');
      server.close(4000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const taken = socks.flatMap(s => this.ctx.getTags(s));
    const role = taken.includes('host') ? 'guest' : 'host';
    this.ctx.acceptWebSocket(server, [role]);
    server.send(JSON.stringify({ t: 'role', role }));
    for (const s of socks) try { s.send('{"t":"joined"}'); } catch {}
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 200_000) return;
    if (msg === '{"t":"ping"}') return;
    for (const s of this.open()) if (s !== ws) try { s.send(msg); } catch {}
  }

  webSocketClose(ws, code) {
    const tags = this.ctx.getTags(ws);
    if (!tags.includes('spectator')) for (const s of this.open()) if (s !== ws) try { s.send('{"t":"left"}'); s.close(4001, 'rival left'); } catch {}
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/room\/([A-Z]{4})$/);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
