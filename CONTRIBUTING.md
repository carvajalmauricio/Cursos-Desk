# Contribuir

Abre un issue para describir un fallo o mejora, o un pull request para aportar cambios. Explica cómo reproducirlo con cursos ficticios y evita adjuntar contenido privado.

Instala Node.js 22+, ejecuta `npm ci` y `npm start`. Comprueba los cambios con `npm run build` y `npm test`. Para cambios de interfaz ejecuta también `npm run test:ui`, `npm run test:player` y `npm run test:visual`, con FFmpeg en PATH.

Mantén la interfaz en español, la paleta neutra y los controles accesibles. Los cambios de persistencia deben conservar el progreso. El renderer no debe obtener acceso directo a Node ni aceptar rutas arbitrarias.

## Publicar

Actualiza la versión en `package.json`, `package-lock.json` y `CHANGELOG.md`. Tras comprobar los cambios, sube un tag con la misma versión, por ejemplo `v1.2.0`. El workflow genera el instalador Windows x64, un checksum y una Release. Si ya existe, conserva sus descargas. No se publica en npm.
