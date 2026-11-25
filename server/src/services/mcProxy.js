import net from 'net';
import { ENV } from '../config/env.js';
import { db } from './firebase.js';

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  while (offset + numRead < buffer.length) {
    const byte = buffer[offset + numRead];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead += 1;
    if (numRead > 5) return null;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: offset + numRead };
    }
  }
  return null;
}

/**
 * Parses a Minecraft Java Edition Handshake packet (Packet ID 0x00)
 * to extract the requested virtual hostname (`serverAddress`), port, and nextState.
 */
export function parseMinecraftHandshake(buffer) {
  const pktLen = readVarInt(buffer, 0);
  if (!pktLen) return null;
  const pktId = readVarInt(buffer, pktLen.nextOffset);
  if (!pktId || pktId.value !== 0x00) return null;
  const protoVer = readVarInt(buffer, pktId.nextOffset);
  if (!protoVer) return null;
  const hostLen = readVarInt(buffer, protoVer.nextOffset);
  if (!hostLen || hostLen.value <= 0 || hostLen.nextOffset + hostLen.value + 2 > buffer.length) {
    return null;
  }
  const rawHost = buffer.slice(hostLen.nextOffset, hostLen.nextOffset + hostLen.value).toString('utf8');
  // Strip Forge / FML / Bungee null-byte suffixes (e.g. "myserver.emochost.com\0FML3\0")
  const cleanHost = rawHost.split('\0')[0].trim().toLowerCase().replace(/\.$/, '');
  const portOffset = hostLen.nextOffset + hostLen.value;
  const serverPort = buffer.readUInt16BE(portOffset);
  const nextState = readVarInt(buffer, portOffset + 2)?.value || 1;
  return { rawHost, cleanHost, serverPort, protocolVersion: protoVer.value, nextState };
}

function buildMcDisconnectPacket(reasonText) {
  const jsonPayload = JSON.stringify({ text: reasonText, color: 'gold' });
  const strBytes = Buffer.from(jsonPayload, 'utf8');
  const lenBytes = [];
  let lenVal = strBytes.length;
  do {
    let temp = lenVal & 0x7f;
    lenVal >>>= 7;
    if (lenVal !== 0) temp |= 0x80;
    lenBytes.push(temp);
  } while (lenVal !== 0);

  const inner = Buffer.concat([Buffer.from([0x00]), Buffer.from(lenBytes), strBytes]);
  const outerLen = [];
  let outVal = inner.length;
  do {
    let temp = outVal & 0x7f;
    outVal >>>= 7;
    if (outVal !== 0) temp |= 0x80;
    outerLen.push(temp);
  } while (outVal !== 0);

  return Buffer.concat([Buffer.from(outerLen), inner]);
}

async function resolveTargetByHost(cleanHost) {
  const snap = await db.collection('servers').where('category', '==', 'minecraft').get();
  const servers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const suffix = `.${ENV.DOMAIN_SUFFIX}`;
  let subCandidate = cleanHost;
  if (cleanHost.endsWith(suffix)) {
    subCandidate = cleanHost.slice(0, -suffix.length);
  } else if (cleanHost.endsWith('.localhost')) {
    subCandidate = cleanHost.slice(0, -'.localhost'.length);
  }

  let matched =
    servers.find((s) => (s.domainAddress || '').toLowerCase() === cleanHost) ||
    servers.find((s) => (s.subdomain || '').toLowerCase() === subCandidate) ||
    servers.find((s) => (s.slug || '').toLowerCase() === subCandidate);

  // Fallback for direct localhost/127.0.0.1 connections on default MC port 25565
  if (!matched && (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === ENV.DOMAIN_SUFFIX)) {
    matched = servers.find((s) => s.status === 'running') || servers.find((s) => s.status !== 'suspended');
  }
  return matched || null;
}

let proxyServer = null;

export function startMcProxyServer() {
  if (proxyServer) return proxyServer;

  proxyServer = net.createServer((clientSocket) => {
    let resolved = false;
    let initialChunks = [];
    let totalBytes = 0;

    const timer = setTimeout(() => {
      if (!resolved && !clientSocket.destroyed) clientSocket.destroy();
    }, 5000);

    clientSocket.on('error', () => {
      clearTimeout(timer);
    });

    clientSocket.on('data', async (chunk) => {
      if (resolved) return;
      initialChunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes > 4096) {
        clearTimeout(timer);
        clientSocket.destroy();
        return;
      }

      const fullBuf = Buffer.concat(initialChunks);
      // Handle Legacy 0xFE Server List Ping
      if (fullBuf[0] === 0xfe) {
        resolved = true;
        clearTimeout(timer);
        const srv = await resolveTargetByHost('localhost').catch(() => null);
        if (!srv || !srv.port || srv.status !== 'running') {
          clientSocket.destroy();
          return;
        }
        const upstream = net.createConnection({ host: '127.0.0.1', port: Number(srv.port) }, () => {
          upstream.write(fullBuf);
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('close', () => upstream.destroy());
        return;
      }

      const parsed = parseMinecraftHandshake(fullBuf);
      if (!parsed) return; // Wait for more bytes if handshake is incomplete

      resolved = true;
      clearTimeout(timer);

      try {
        const target = await resolveTargetByHost(parsed.cleanHost);
        if (!target || !target.port) {
          if (parsed.nextState === 2) {
            clientSocket.end(buildMcDisconnectPacket(`EmoçHosting: "${parsed.cleanHost}" alan adına bağlı sunucu bulunamadı.`));
          } else {
            clientSocket.destroy();
          }
          return;
        }

        if (target.status !== 'running') {
          if (parsed.nextState === 2) {
            clientSocket.end(
              buildMcDisconnectPacket(`EmoçHosting: "${target.name}" (${target.domainAddress || target.subdomain + '.' + ENV.DOMAIN_SUFFIX}) şu anda uyku/kapalı durumda.`)
            );
          } else {
            clientSocket.destroy();
          }
          return;
        }

        const upstream = net.createConnection({ host: '127.0.0.1', port: Number(target.port) }, () => {
          upstream.write(fullBuf);
          clientSocket.pipe(upstream);
          upstream.pipe(clientSocket);
        });

        upstream.on('error', () => {
          if (!clientSocket.destroyed) clientSocket.destroy();
        });
        clientSocket.on('close', () => {
          if (!upstream.destroyed) upstream.destroy();
        });
      } catch {
        clientSocket.destroy();
      }
    });
  });

  proxyServer.on('error', (err) => {
    console.warn(`[MC Domain Router] Port ${ENV.MC_PROXY_PORT} dinlenemedi: ${err.message}`);
  });

  proxyServer.listen(ENV.MC_PROXY_PORT, ENV.HOST, () => {
    console.log(`🌐 EmoçHosting Domain TCP Proxy aktif -> *.${ENV.DOMAIN_SUFFIX}:${ENV.MC_PROXY_PORT}`);
  });

  return proxyServer;
}
