import {build as viteBuild} from 'vite';
import {build as buildServer} from 'esbuild';
await viteBuild();
await buildServer({entryPoints:['server.ts'],bundle:true,platform:'node',target:'node22',format:'esm',packages:'external',outfile:'server-dist/server.mjs'});
console.log('Frontend and production Node server built.');
