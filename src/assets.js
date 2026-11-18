import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERSION_PLACEHOLDER = '__ASSET_VERSION__';

/**
 * Impressão digital da interface (arquivos de public/). Vai no HTML e em cada snapshot:
 * se a página aberta no celular for de outra versão, ela se recarrega sozinha.
 */
export function assetVersion(dir) {
  const hash = createHash('sha1');
  readdirSync(dir).sort().forEach((name) => {
    hash.update(name);
    hash.update(readFileSync(join(dir, name)));
  });
  return hash.digest('hex').slice(0, 12);
}
