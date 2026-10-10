# Validacion de fase 14

La modularizacion tecnica de la fase esta culminada. Esta guia conserva las
pruebas de aceptacion que debe ejecutar un operador con datos reales.

## Automatizada (completada)

- Se verificaron los scripts declarados en `control_patrones.html` con
  `node --check`: 68 scripts, sin errores de sintaxis.
- La pagina activa carga correctamente en Edge sin interfaz.
- Los modulos activos de codigo, excluyendo datos y el adaptador legado,
  no superan 300 lineas.
- El hash SHA-256 de `control_patrones_original.html` permanece en
  `4996F49D0D74A83F2BC6E9DD71940A771D8F2C6CD697B9803F3066B0FE8DF8E7`.
- La tabla Code 128 fue comparada contra los 107 patrones de la referencia.
- El lector se separo en `js/ui/scanner-global-handler.js` y
  `js/ui/scanner-utilities.js`; conserva la resolucion por caracter y por
  tecla fisica, la limpieza de texto fugado y la preferencia de sonido.
- Las reglas de roles, tecnicos y responsables se trasladaron a
  `js/domain/personnel.js` y la pagina carga correctamente tras el cambio.
- La creacion y el deshacer de grupos PEM2 se trasladaron a
  `js/usecases/initial-weight-groups.js`; no quedan duplicados activos de
  esa logica en el adaptador legado.

## Validacion interactiva pendiente

- Registrar una salida normal y una salida de grupo; revisar cantidades.
- Escanear y confirmar una devolucion total y parcial.
- Corregir una OT: cliente, sede, tecnico, patron agregado y patron retirado.
- Crear, editar y eliminar una empresa y una sede; probar Deshacer.
- Crear, editar y calibrar un patron; abrir su ficha.
- Generar etiquetas en PDF e impresion; validar lectura de Code 128.
- Generar programa, inventario, vencimientos, solicitud, ficha y acta PDF.

Esta aceptacion requiere interaccion visible y descarga de archivos en el
equipo del operador; no se simula como completada con una carga sin interfaz.
