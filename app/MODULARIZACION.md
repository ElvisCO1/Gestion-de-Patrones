# Migración modular

## Fase actual: 9 — Lector de códigos

La referencia funcional es
[`control_patrones_original.html`](control_patrones_original.html). No se
modifica durante la migración.

La segunda fase extrae los servicios de datos que requieren consistencia:

- `js/data/indexeddb.js`: conexión `MetrologiaDB` versión 4, seis almacenes,
  índices, lectura, escritura, borrado, limpieza y transacciones atómicas.
- `js/data/mirror.js`: copia automática a carpeta, respaldo diario y estado de
  conexión de la carpeta.
- `js/data/bootstrap.js`: migración desde `localStorage` y carga del catálogo
  inicial, sin alterar sus códigos ni la condición de primera ejecución.
- `js/data/initial-catalog*.js`: catálogo inicial dividido como datos, para que
  ningún archivo de lógica mezcle cientos de registros con comportamiento.

`js/legacy/app-reference.js` conserva los nombres que utiliza el resto de la
aplicación (`getAll`, `saveRecord`, `programarEspejo`, etc.), pero ahora son
adaptadores a esos servicios. Así se evita una migración masiva que cambie
todos los controladores a la vez.

La tercera fase ya separa reglas reutilizables de la interfaz:

- `js/domain/activity.js`: normalización de nombres y códigos, actividades
  ISO 17025, vencimientos, frecuencias, tipos y bloqueo por calibración.
- `js/domain/date.js`: fecha local, hora de salida, orden cronológico y
  formato de fechas.
- `js/domain/inventory.js`: movimientos, patrones de grupo, cantidades,
  disponibilidad y estados operativos.
- `js/domain/catalog-program.js`: filtros de patrones y cálculo de celdas del
  programa anual, sin depender del DOM.
- `js/domain/history.js`: agrupación de OT, consultas de trazabilidad,
  observaciones y cantidades de salida.
- `js/ui/catalog-program-controller.js`: listeners de filtros, búsqueda,
  programa anual, PDF y navegación de esa pantalla.
- `js/ui/history-controller.js`: búsqueda de historial, navegación y flujos
  de importación/exportación de respaldos.
- `js/ui/dispatch-return-controller.js`: registro de salida, cliente/sede,
  limpieza de selección y modal de devoluciones.
- `js/ui/admin-controller.js`: navegación y eventos de Patrones, Personal y
  Clientes.
- `js/ui/assets-controller.js`: etiquetas, inventario, búsqueda y acciones
  delegadas por área.
- `js/ui/logo-controller.js`: selección, cierre y restauración del logo PDF.
- `js/ui/scanner-controller.js`: captura global, campos dedicados y sonido del
  lector de códigos.

## Estructura cargada

```text
app/
├── control_patrones.html
├── control_patrones_original.html   # golden master, no se edita
├── css/app.css
├── vendor/jspdf.umd.min.js
└── js/
    ├── core/namespace.js
    ├── domain/activity.js            # reglas ISO y patrones
    ├── domain/date.js                # fecha y hora local
    ├── domain/inventory.js           # reglas operativas de inventario
    ├── domain/catalog-program.js     # catálogo y programa anual
    ├── domain/history.js             # historial, salidas y devoluciones
    ├── ui/catalog-program-controller.js # eventos de catálogo y programa
    ├── ui/history-controller.js      # eventos de historial y respaldos
    ├── ui/dispatch-return-controller.js # eventos de salidas y devoluciones
    ├── ui/admin-controller.js        # eventos administrativos y navegación
    ├── ui/assets-controller.js       # etiquetas e inventario
    ├── ui/logo-controller.js         # logo de documentos
    ├── ui/scanner-controller.js      # lector de códigos y sonido
    ├── data/indexeddb.js            # datos transaccionales
    ├── data/mirror.js               # copia automática a disco
    ├── data/initial-catalog*.js     # datos del catálogo inicial
    ├── data/bootstrap.js            # migración y catálogo inicial
    └── legacy/app-reference.js      # lógica aún pendiente de extraer
```

El orden de carga es jsPDF, espacio de nombres, IndexedDB, espejo y lógica de
compatibilidad. El sistema sigue abriéndose con doble clic en
`control_patrones.html`: no requiere servidor, Node ni dependencias.

## Compatibilidad preservada

- Nombre de base: `MetrologiaDB`; versión: `4`.
- Almacenes: `patrones`, `tecnicos`, `historial`, `config`, `actividades` y
  `clientes`, con los mismos índices y claves originales.
- Las operaciones de varias tiendas siguen ejecutándose en una sola
  transacción IndexedDB.
- Cada escritura exitosa sigue programando el espejo automático, excepto la
  configuración interna, igual que el original.
- El respaldo automático conserva su formato JSON y el logo configurado.

## Cierre de la fase 2

La capa de datos ya concentra IndexedDB, espejo automático, migración y datos
iniciales. La importación/exportación manual todavía se coordina con diálogos,
filtros y renderizado; se tratará junto con la interfaz para no separar de
forma artificial flujos que necesitan confirmar y refrescar pantalla.

## Cierre de la fase 3

Las reglas centrales ya no dependen de la interfaz. Los adaptadores que quedan
en compatibilidad solo entregan el historial en memoria a funciones puras,
evitando que los controladores existentes cambien todos a la vez.

## Cierre de la fase 4

Catálogo y Programa Anual delegan áreas, categorías, búsqueda, filtros y
celdas del calendario a módulos puros. Historial, salidas y devoluciones ya
delegan agrupación, trazabilidad y observaciones. El DOM, diálogos y eventos
siguen en compatibilidad para conservar el comportamiento visible.

## Cierre de la fase 5

Los controladores de Catálogo/Programa e Historial/Respaldos registran sus
propios listeners. Reciben las acciones existentes por inyección para no crear
otra fuente de verdad ni duplicar eventos.

## Cierre de la fase 6

El controlador de Salidas y Devoluciones recibe las acciones existentes por
inyección y concentra sus listeners. El lector de códigos se mantiene en el
archivo de compatibilidad: usa captura global de teclado y debe migrarse con
pruebas manuales de lectores físicos.

## Cierre de la fase 7

Patrones, Personal y Clientes ya comparten un controlador para sus altas,
búsquedas y navegación. Los formularios y modales especializados conservan
su lógica existente como adaptadores de compatibilidad.

## Cierre de la fase 8

Etiquetas, Inventario y Logo ya registran eventos desde módulos propios. Los
generadores PDF y el renderizado se inyectan como acciones para preservar sus
formatos y resultados actuales.

## Cierre de la fase 9

El controlador del lector conserva la captura en fase de captura, las lecturas
por tecla física, los campos dedicados y la preferencia de sonido. Su carga se
validó en Edge; la validación final con hardware físico sigue siendo necesaria.

## Fase 10 — Renderizadores por pantalla

- `js/ui/dashboard-renderer.js`: panel Inicio desacoplado, con datos y
  acciones inyectadas.
- `js/ui/clients-renderer.js`: lista de Clientes desacoplada; conserva las
  operaciones de guardar y eliminar como adaptadores de compatibilidad.
- `js/ui/personnel-renderer.js`: vista de Técnicos y Encargados, con edición
  y eliminación todavía inyectadas desde compatibilidad.
- `js/ui/catalog-renderer.js`: lista y filtros visuales de Patrones; edición
  y borrado continúan como acciones de compatibilidad.
- `js/ui/history-renderer.js`: vista, búsqueda, agrupación de OT y acciones
  visuales de Historial; las transiciones de datos siguen inyectadas.
- `js/ui/pattern-form-renderer.js`: generación del formulario de edición de
  Patrones; el guardado transaccional permanece en compatibilidad.
- `js/usecases/pattern-actions.js`: edición transaccional de Patrones,
  incluyendo renombre en cascada de historial y actividades.

Se validaron Inicio, Clientes, Personal, Catálogo e Historial durante el
arranque en Edge. La siguiente etapa será separar formularios y acciones de
escritura, una operación crítica a la vez.

## Fase 11 — Casos de uso transaccionales (culminada)

- `js/usecases/pattern-actions.js`: alta, edicion y registro de actividad de
  patrones, incluido el renombre consistente en historial y actividades.
- `js/usecases/dispatch-actions.js`: registro atomico de salidas, con
  validacion de disponibilidad y cantidades de grupos.
- `js/usecases/return-actions.js`: devolucion total, parcial o directa, envio
  a otro servicio y sus transiciones de inventario.
- `js/usecases/client-actions.js`: altas, edicion y bajas de empresas y sedes.
- `js/usecases/personnel-actions.js`: altas, edicion, activacion y bajas de
  tecnicos y encargados.
- `js/usecases/order-actions.js`: correccion y eliminacion transaccional de
  una salida/OT, con trazabilidad, inventario y deshacer.
- `js/usecases/destructive-actions.js`: bajas de patrones y borrados totales
  confirmados de patrones o tecnicos.

El archivo de referencia conserva solamente adaptadores de interfaz para estos
flujos. Los JSON de respaldo y sus copias automaticas son datos operativos;
no forman parte de esta fase ni de la modularizacion del codigo.

## Fase 12 - Administracion y documentos (culminada)

- `js/usecases/backup-actions.js`: exportacion, importacion completa y fusion
  de programas. Opera el contenido elegido por el usuario, sin incorporar los
  archivos JSON generados por el uso normal del sistema.
- `js/usecases/logo-actions.js`: preparacion, guardado y restauracion del logo
  institucional.
- `js/reports/program-report.js`, `expiration-report.js` e `inventory-report.js`:
  generadores de programa anual, vencimientos e inventario.
- `js/reports/calibration-request-report.js`, `pattern-sheet-report.js` y
  `label-report.js`: solicitud de calibracion, ficha del patron y etiquetas.
- `js/reports/dispatch-certificate-report.js`: acta de salida de patrones.

Los PDF mantienen inyectados los adaptadores visuales especializados que ya
funcionaban (codigo de barras, encabezado, firmas y pie), sin duplicar la
logica de negocio en el archivo legado.
## Fase 13 - Renderizadores, formularios y flujos de pantalla (culminada)

- `js/ui/inventario.js`: renderizado de inventario por laboratorio, busqueda,
  secciones plegables e indice de navegacion. El archivo legado conserva un
  adaptador que inyecta estado y utilidades existentes.
- `js/ui/personnel-controller.js`: eventos de activacion, baja, edicion y
  validacion de Personal. Trabaja junto con `personnel-renderer.js`, que ya
  contiene exclusivamente el marcado de la vista.
- `js/ui/history-controller.js`: acciones de Historial para devoluciones,
  reenvios, observaciones, correcciones, actas y eliminacion de servicios.
  El renderizador permanece separado en `history-renderer.js`.
- `js/ui/catalog-program-controller.js`: acciones de Catalogo para etiquetas,
  calibracion, ficha, duplicado, edicion y eliminacion segura de patrones.
  El listado visual permanece en `catalog-renderer.js`.
- `js/ui/pattern-detail-renderer.js`: ficha detallada del patron con programa,
  actividades ejecutadas, salidas y alerta de no conformidad.
- `js/ui/program-renderer.js`: tabla del programa anual, filtros, resumen y
  acceso al registro de actividades por patron y mes.
- `js/reports/label-print.js`: vista previa e impresion de etiquetas con la
  misma configuracion, agrupacion y distribucion por hoja que el PDF.
- `js/domain/order-edit.js`: calculo de cambios de una correccion de OT para
  conservar la trazabilidad de datos, patrones y encargado de laboratorio.
- `js/ui/clients-controller.js`: eventos de Clientes para crear y editar sedes,
  editar empresas y ejecutar bajas seguras con deshacer.
- `js/ui/dispatch-summary-renderer.js`: resumen de Salida por laboratorio,
  seleccion, cantidades de grupos y limites de piezas disponibles.
- `js/ui/dispatch-pattern-list-renderer.js`: listado seleccionable de patrones,
  estados, vencimientos de calibracion y disponibilidad de grupos.
- `js/ui/return-list-renderer.js`: lista de Devolucion pendiente con retiro de
  elementos y cantidades parciales de grupos antes de confirmar.
- `js/usecases/dispatch-scan-actions.js`: validacion de codigos escaneados,
  disponibilidad, calibracion y seleccion de patrones para Salida.
- `js/usecases/return-scan-actions.js`: deteccion de salidas activas y
  preparacion de retornos escaneados, incluidas cantidades de grupos.
- `js/ui/pattern-form-renderer.js`: marcado y ciclo de apertura, cierre y
  sincronizacion del formulario de edicion de patrones bajo demanda.
- `js/ui/order-editor-renderer.js`: listas de patrones del editor de OT,
  busqueda, retiro, agregado y cantidades de grupos.
- `js/ui/observation-modal.js`: presentacion de observaciones de patron,
  servicio completo y correccion de una devolucion registrada.
- `js/reports/label-pdf-renderer.js`: dibujado individual de etiquetas PDF,
  con ajuste de texto y disposicion vertical u horizontal de Code 128.
- `js/ui/order-editor-modal.js`: preparacion de estado y apertura del modal
  para corregir una salida/OT existente.
- `js/ui/app-render-coordinator.js`: coordinacion de recarga de datos y
  refresco consistente de las pantallas activas.
- `js/ui/calibration-modal.js`: carga de actividad, vista previa de
  vencimiento y apertura del modal de registro de calibracion.

Se validaron los 60 scripts cargados por la pagina: no presentan errores de
sintaxis. Los componentes activos, salvo el archivo de compatibilidad legado,
se mantienen por debajo de 300 lineas; el original de referencia no se altera.

## Fase 14 (tecnicamente culminada) - Estabilizacion y retiro gradual de compatibilidad

- `js/domain/barcode-code128.js`: codificacion, validacion y salida PDF/SVG
  de Code 128. Se compararon los 107 patrones contra la referencia original.
- `js/ui/feedback.js`: avisos no bloqueantes y confirmaciones reutilizables.
- `js/ui/app-startup.js`: secuencia de base de datos, migraciones, catalogo
  inicial, restauracion y primer render.
- `js/ui/scanner-global-handler.js`: estado y deteccion de rafagas de lectores
  que emulan teclado; el legado conserva solo el adaptador de pantalla.
- `js/ui/scanner-utilities.js`: reconstruccion de teclas fisicas, resolucion
  de lecturas alternativas y preferencia/aviso sonoro del lector.
- `js/domain/personnel.js`: roles, tecnicos activos y responsables por
  laboratorio, aislados del estado de pantalla.
- `js/usecases/initial-weight-groups.js`: creacion inicial reversible de
  grupos PEM2, con deduccion de datos desde el catalogo y transacciones.
- Auditoria final automatizada: 68 scripts activos verificados, cero errores de
  sintaxis y ningun modulo activo no legado supera 300 lineas.

La fase tecnica queda culminada. La aceptacion operativa pendiente requiere
validacion interactiva por un operador en los flujos de
Salida, Devolucion, correccion de OT, Clientes, Patrones, etiquetas y PDF.
La carga automatizada en navegador ya fue satisfactoria; esta ultima revision
confirma acciones y archivos descargados en el entorno real de uso.
