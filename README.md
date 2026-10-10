# Gestión de Patrones — Metrología

Aplicación web local para registrar salidas y devoluciones de patrones, administrar inventario técnico, clientes, personal, programas de calibración y emitir documentos PDF.

## Requisitos para usar o publicar

- Navegador moderno: Microsoft Edge, Google Chrome o Firefox actualizado.
- JavaScript habilitado.
- No requiere Node.js, Python, servidor, base de datos externa ni instalación de librerías.
- Para las copias automáticas en una carpeta se recomienda Edge o Chrome, ya que usan la API de acceso a directorios del navegador.

La aplicación se ejecuta abriendo [app/control_patrones.html](app/control_patrones.html) en el navegador. Para publicar el código como repositorio, basta conservar la estructura completa de la carpeta `app/`.

## Funcionalidades principales

- Registro de salida y devolución de patrones.
- Historial de órdenes de trabajo con búsqueda, ordenamiento y paginación.
- Catálogo de patrones, laboratorios, estados y actividades ISO 17025.
- Gestión de técnicos, equipos asignados, empresas clientes y sedes.
- Inventario agrupado por magnitud o laboratorio.
- Programa anual y reportes PDF.
- Etiquetas con código de barras.
- Documento de salida configurable: encabezado, logo, datos del cuerpo, tabla de patrones y pie.
- Configuración protegida mediante usuario y contraseña local.
- Exportación/importación de respaldos JSON y copia automática opcional a carpeta.

## Acceso inicial a Configuración

La sección **Configuración** está protegida para evitar cambios accidentales.

- Usuario inicial: `admin`
- Contraseña inicial: `admin123`

La contraseña puede cambiarse desde Configuración. Se guarda localmente como hash SHA-256 con salt; es una protección básica de interfaz, no un sistema de autenticación con servidor. Al salir de Configuración, el acceso se bloquea de forma automática.

## Datos y respaldos

Los datos se guardan en IndexedDB dentro del navegador. Esto implica que cada equipo y cada perfil de navegador dispone de su propio almacenamiento.

Antes de mover el sistema a otro equipo, exporta un respaldo desde **Configuración → Datos y respaldo**. Luego abre la aplicación en el equipo destino e importa ese archivo JSON. El respaldo conserva los datos operativos y las configuraciones del documento y de acceso.

## Estructura relevante

```text
app/
├── control_patrones.html     # Punto de entrada
├── css/app.css               # Estilos
└── js/
    ├── data/                 # IndexedDB y copia a carpeta
    ├── domain/               # Reglas y utilidades de dominio
    ├── reports/              # Generación de reportes PDF
    ├── ui/                   # Controladores y componentes de interfaz
    ├── usecases/             # Casos de uso
    └── legacy/               # Integración heredada pendiente de migración gradual
```

## Estado técnico

El proyecto está funcional y no tiene dependencias instalables. Parte de la lógica sigue concentrada en `app/js/legacy/app-reference.js`, ya que proviene de una versión inicial más monolítica.

La modularización adicional es una mejora recomendada, pero no es un requisito para publicar o utilizar la aplicación. Antes de retirar código heredado, conviene identificar sus dependencias y comprobar los flujos de salida, historial, PDF, respaldos y configuración.

## Recomendaciones antes de publicar

- No publicar respaldos reales, datos de clientes ni archivos con información sensible.
- Revisar qué carpetas de ejemplo, respaldos o documentos internos deben excluirse del repositorio.
- Añadir una licencia solo después de decidir las condiciones de uso y distribución.
- Mantener una copia del proyecto antes de eliminar módulos heredados.
