import { readFileSync } from 'node:fs';

export const appIcon = {
  src: `data:image/png;base64,${readFileSync(new URL('./assets/orbit-planet.png', import.meta.url)).toString('base64')}`,
  mimeType: 'image/png',
};
