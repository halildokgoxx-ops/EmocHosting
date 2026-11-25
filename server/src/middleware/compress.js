import zlib from 'zlib';

const COMPRESSIBLE_RE =
  /^(?:text\/(?!event-stream)|application\/(?:javascript|x-javascript|json|xml|manifest\+json)|image\/svg\+xml)/i;

function selectEncoding(acceptEncoding = '') {
  const header = String(acceptEncoding || '').toLowerCase();
  if (!header) return null;
  if (/\bbr\b/.test(header)) return 'br';
  if (/\bgzip\b/.test(header)) return 'gzip';
  return null;
}

/**
 * Streaming Brotli / Gzip response compression middleware using Node built-in zlib.
 * Preserves backpressure, handles express.static streams safely, and leaves binary downloads untouched.
 */
export function compressionMiddleware({ threshold = 1024 } = {}) {
  return function compress(req, res, next) {
    if (req.method === 'HEAD' || req.headers['range']) return next();

    const encoding = selectEncoding(req.headers['accept-encoding']);
    res.vary('Accept-Encoding');
    if (!encoding) return next();

    const origWriteHead = res.writeHead.bind(res);
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    let decided = false;
    let compressing = false;
    let zStream = null;

    function shouldCompress(statusCode) {
      if (statusCode < 200 || statusCode === 204 || statusCode === 304) return false;
      if (res.getHeader('Content-Encoding')) return false;
      const cc = String(res.getHeader('Cache-Control') || '');
      if (/\bno-transform\b/i.test(cc)) return false;
      const contentType = String(res.getHeader('Content-Type') || '').split(';')[0].trim();
      if (!contentType || !COMPRESSIBLE_RE.test(contentType)) return false;
      const rawLen = Number(res.getHeader('Content-Length'));
      if (Number.isFinite(rawLen) && rawLen > 0 && rawLen < threshold) return false;
      return true;
    }

    function startCompression(statusCode, reasonPhrase) {
      compressing = true;
      res.removeHeader('Content-Length');
      const etag = res.getHeader('ETag');
      if (typeof etag === 'string' && !etag.startsWith('W/')) {
        res.setHeader('ETag', `W/${etag}`);
      }
      res.setHeader('Content-Encoding', encoding);

      zStream =
        encoding === 'br'
          ? zlib.createBrotliCompress({
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
              },
            })
          : zlib.createGzip({ level: 6 });

      zStream.on('data', (chunk) => {
        if (!origWrite(chunk)) {
          zStream.pause();
        }
      });
      res.on('drain', () => {
        if (zStream) zStream.resume();
      });
      zStream.on('end', () => {
        origEnd();
      });
      zStream.on('error', () => {
        if (!res.writableEnded) origEnd();
      });

      if (reasonPhrase) {
        origWriteHead(statusCode, reasonPhrase);
      } else {
        origWriteHead(statusCode);
      }
    }

    res.writeHead = function wrappedWriteHead(statusCode, reasonOrHeaders, maybeHeaders) {
      let reason = '';
      let headersObj = maybeHeaders;
      if (typeof reasonOrHeaders === 'string') {
        reason = reasonOrHeaders;
      } else if (reasonOrHeaders && typeof reasonOrHeaders === 'object') {
        headersObj = reasonOrHeaders;
      }

      if (headersObj) {
        for (const [k, v] of Object.entries(headersObj)) {
          res.setHeader(k, v);
        }
      }

      if (!decided) {
        decided = true;
        if (shouldCompress(statusCode)) {
          startCompression(statusCode, reason);
          return res;
        }
      }

      if (compressing) return res;
      return reason ? origWriteHead(statusCode, reason) : origWriteHead(statusCode);
    };

    res.write = function wrappedWrite(chunk, enc, cb) {
      if (!decided) {
        decided = true;
        if (shouldCompress(res.statusCode)) {
          startCompression(res.statusCode);
        } else {
          origWriteHead(res.statusCode);
        }
      }
      if (compressing && zStream) {
        return zStream.write(chunk, enc, cb);
      }
      return origWrite(chunk, enc, cb);
    };

    res.end = function wrappedEnd(chunk, enc, cb) {
      if (typeof chunk === 'function') {
        cb = chunk;
        chunk = undefined;
        enc = undefined;
      } else if (typeof enc === 'function') {
        cb = enc;
        enc = undefined;
      }

      if (!decided) {
        decided = true;
        const chunkLen = chunk
          ? Buffer.isBuffer(chunk)
            ? chunk.length
            : Buffer.byteLength(String(chunk), enc || 'utf8')
          : 0;

        if (chunkLen > 0 && chunkLen < threshold) {
          return origEnd(chunk, enc, cb);
        }
        if (shouldCompress(res.statusCode)) {
          startCompression(res.statusCode);
        } else {
          return origEnd(chunk, enc, cb);
        }
      }

      if (compressing && zStream) {
        if (chunk !== undefined) {
          zStream.end(chunk, enc, cb);
        } else {
          zStream.end(cb);
        }
        return res;
      }

      return origEnd(chunk, enc, cb);
    };

    next();
  };
}
