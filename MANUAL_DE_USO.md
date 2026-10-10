# Manual de uso — Gestión de Patrones

## 1. Propósito

Esta aplicación local permite administrar patrones de metrología, registrar sus salidas y devoluciones, controlar actividades de calibración, mantener el inventario, generar etiquetas y emitir la lista de equipos para servicio a campo.

Los datos se guardan en el navegador del equipo. No necesita Internet para funcionar.

## 2. Inicio rápido

1. Abra `app/control_patrones.html` con Microsoft Edge, Google Chrome o Firefox actualizado.
2. Ingrese primero a **Configuración** y conecte una carpeta de datos si desea que se creen copias JSON automáticas.
3. Registre laboratorios, técnicos, clientes y patrones.
4. Use **Registrar salida** para crear una orden de trabajo y seleccionar los patrones.
5. Al retorno del servicio, ingrese a **Historial** y realice la devolución de cada patrón.

> Recomendación: use Microsoft Edge o Google Chrome si empleará el escáner, las copias automáticas en carpeta o la descarga de PDFs.

## 3. Menú principal

| Sección | Uso principal |
|---|---|
| **Inicio** | Consulta rápida del estado general. |
| **Indicadores** | Revisión de vencimientos y métricas operativas. |
| **Registrar salida** | Crea una OT y agrega patrones que salen a servicio. |
| **Historial** | Consulta, corrige, descarga y devuelve salidas registradas. |
| **Programa anual** | Revisa y administra actividades de calibración, comprobación y mantenimiento. |
| **Patrones** | Crea y administra el catálogo técnico y las etiquetas. |
| **Personal** | Registra técnicos y sus equipos asignados. |
| **Clientes** | Registra empresas, sedes y datos de contacto. |
| **Inventario** | Consulta patrones por magnitud en una lista agrupada. |
| **Configuración** | Ajusta documentos, respaldos y la contraseña de configuración. |

## 4. Configuración inicial

### 4.1 Acceso a Configuración

La primera vez utilice:

- Usuario: `admin`
- Contraseña: `admin123`

Después de entrar, cambie la contraseña desde **Configuración → Acceso a Configuración**. Esta protección es local: evita cambios accidentales en ese navegador, pero no sustituye un sistema de usuarios con servidor.

Al salir de **Configuración** hacia cualquier otra sección, el acceso se bloquea automáticamente.

### 4.2 Carpeta de datos y respaldo automático

En **Configuración → Datos y respaldo**, pulse **Conectar carpeta de datos** y elija una carpeta exclusiva para la aplicación.

Al guardar información, la aplicación puede crear o actualizar:

- `datos_metrologia.json`: copia actual de la información.
- `respaldos/`: copias de respaldo generadas en la carpeta seleccionada.

No seleccione una carpeta compartida con archivos ajenos si no desea mezclar documentos del sistema con otros archivos.

## 5. Registrar laboratorios, personal y clientes

Antes de emitir una salida, conviene tener cargados los datos base.

### Personal

En **Personal**, use **Añadir personal**. Registre el nombre del técnico, estado activo y, de ser necesario, los equipos asignados, como laptop o termohigrómetro.

### Clientes

En **Clientes**, cree la empresa y al menos una sede. La sede reúne nombre, dirección y datos de contacto. En una OT primero se elige la empresa y luego la sede.

### Patrones

En **Patrones → Añadir patrón nuevo**, complete como mínimo:

- Laboratorio o magnitud.
- Equipo o descripción.
- Código único.
- Estado inicial.

Los datos de marca, modelo, serie y valor nominal son opcionales, pero el **valor nominal** es necesario para que algunas etiquetas se puedan generar correctamente.

Para cada patrón puede definir actividades ISO 17025:

- **CAL**: Calibración.
- **V**: Comprobación intermedia.
- **M**: Mantenimiento.

Indique frecuencia, vencimiento, tipo y última ejecución únicamente cuando correspondan.

## 6. Registrar una salida

1. Abra **Registrar salida**.
2. Complete número de OT, fecha/hora, empresa, sede y técnico asignado.
3. Agregue patrones mediante el lector, escribiendo el código o seleccionándolos en el catálogo.
4. Revise el panel **Patrones seleccionados para esta salida**. Si la lista supera el alto visible, use su barra de desplazamiento interna.
5. Retire un patrón individual con el botón `×` o use **Quitar todos**.
6. Pulse **Registrar salida y guardar en historial**.

La aplicación valida que el patrón esté disponible y que no tenga una condición que impida su salida, como una actividad vencida.

### Uso del lector de código de barras

Haga clic en el campo **Dispara el lector, o escribe el código y pulsa Enter** antes de escanear. El lector funciona como teclado: envía el código y normalmente finaliza con `Enter` o `Tab`.

También puede escribir el código manualmente y pulsar `Enter`. Si el dispositivo utiliza una distribución de teclado distinta y transforma guiones en comillas, el sistema intenta reconstruir el código físico del lector.

El mensaje bajo el campo debe mantenerse visible: confirma el patrón añadido o informa por qué no puede agregarse.

## 7. Consultar historial y registrar devoluciones

En **Historial** puede buscar, ordenar y navegar las OT registradas. La lista se muestra de 20 resultados por página y el contador indica el total encontrado.

Desde una OT puede:

- Corregir datos de la OT.
- Añadir o revisar observaciones.
- Descargar el PDF.
- Iniciar la devolución.
- Eliminar la OT, únicamente si está seguro de que ya no se necesita.

### Devolución

1. Pulse **Devolver** o la acción equivalente de la OT.
2. Escanee o escriba cada código que vuelve al laboratorio.
3. Revise la lista acumulada.
4. Pulse **Confirmar devolución**.

Hasta confirmar, los códigos solo están en la lista temporal. Al confirmar, los patrones vuelven a quedar disponibles y se cierra su salida en el historial.

## 8. Inventario y programa anual

### Inventario

**Inventario** muestra el catálogo agrupado por magnitud. Utilice el buscador y los filtros superiores para acotar el resultado.

Las magnitudes se distinguen dentro de una única caja con desplazamiento interno: así la pantalla no crece indefinidamente aunque existan cientos de patrones.

### Programa anual

En **Programa anual**, revise las próximas actividades y vencimientos. Mantenga actualizadas las fechas de ejecución al concluir una calibración, comprobación o mantenimiento.

## 9. Etiquetas de patrones

Desde el catálogo de **Patrones** seleccione uno o más equipos y pulse **Configurar etiquetas**.

Puede elegir:

- Tamaño de etiqueta: 5 × 2 cm, 9 × 1 cm, 14 × 3,5 cm o medida personalizada.
- Incluir o no código de barras Code 128.
- Agrupar o no por tipo de equipo.

Use **Vista previa / imprimir** para comprobar el resultado antes de descargar. Cuando el contenido es extenso, el sistema adapta el texto sin cortar el código de barras.

## 10. Configurar el documento PDF

En **Configuración → Formato del documento** puede personalizar la lista de equipos para servicio a campo.

### Encabezado

- Cambiar el título del documento. Este título es obligatorio.
- Mostrar u ocultar el logo.
- Cargar o reemplazar el logo del encabezado.

### Cuerpo

Cada dato de la OT puede activarse o desactivarse con su casilla: número de OT, empresa, sede, dirección, técnico, laptop, termohigrómetro, fecha y hora.

Los datos desactivados no dejan espacios vacíos: el cuerpo se reacomoda automáticamente.

### Tabla de patrones

También se pueden editar u ocultar el título de la tabla y los encabezados de sus columnas: código, cantidad, laboratorio y equipo. El título de la tabla es obligatorio.

Para aprovechar el ancho del PDF, en la columna **Laboratorio** use solo la magnitud, por ejemplo `Temperatura` o `Físico-Química`; no repita “Laboratorio de…”.

### Varias páginas

El encabezado, pie y numeración se repiten en cada página. La tabla continúa sin un título adicional de “continuación”. Las observaciones siempre se colocan al final, justo encima de las firmas; si no entran, pasan junto con las firmas a una nueva página.

## 11. Exportar, importar y mover datos

### Crear un respaldo

En **Configuración → Datos y respaldo**, pulse **Exportar respaldo**. Guarde el archivo JSON en una ubicación segura.

### Restaurar en otro equipo

1. Copie toda la carpeta `app/` al equipo destino.
2. Abra `app/control_patrones.html` en el navegador.
3. Ingrese a **Configuración**.
4. Pulse **Importar respaldo** y seleccione el JSON exportado.

La importación reemplaza o restaura la información según la opción elegida. Para actualizar solamente el catálogo y actividades de un programa, use **Importar programa (fusionar)** cuando corresponda.

> Antes de importar, exporte un respaldo del equipo destino. Así podrá volver atrás si el archivo elegido no era el correcto.

## 12. Buenas prácticas

- Exporte un respaldo antes de hacer cambios masivos o importar archivos.
- Use códigos únicos, cortos y consistentes para los patrones.
- Mantenga actualizados los estados: Disponible, En servicio, Baja u otros definidos en la aplicación.
- Registre observaciones relevantes en la OT para conservar trazabilidad.
- No comparta respaldos que contengan datos reales de clientes, direcciones, teléfonos o personal sin autorización.
- Para una entrega de muestra, use `respaldos/para_compartir/respaldo_de_prueba_compartible.json`.

## 13. Solución rápida de problemas

| Situación | Qué revisar |
|---|---|
| El lector no añade un patrón | Confirme que el cursor esté en el campo del lector y que el código exista y esté disponible. |
| No se puede sacar un patrón | Revise su estado y actividades vencidas. |
| No se genera una etiqueta | Revise que el patrón tenga valor nominal cuando el formato lo requiera. |
| No aparecen datos en otro equipo | Importe el respaldo JSON: los datos no viajan solo al copiar el HTML. |
| No se puede abrir Configuración | Use la contraseña configurada; en una instalación nueva es `admin123`. |
| No se crea la copia automática | Verifique que se conectó una carpeta y que el navegador autorizó el acceso. |

