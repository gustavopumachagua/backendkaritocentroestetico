# KARITO BEAUTY ESTHETIC CENTER S.A.C. · Backend

API REST y canal Socket.IO del sistema de gestión clínica, operativa y administrativa de KARITO BEAUTY ESTHETIC CENTER S.A.C. El backend administra autenticación, usuarios, citas, tratamientos, inventario, pagos, historias clínicas, imágenes y notificaciones; el frontend React se encuentra en [`../Web_Estetico`](../Web_Estetico).

El proyecto es una aplicación Node.js escrita en JavaScript con módulos CommonJS, organizada por capas. Este documento describe lo que está implementado, sus contratos y los límites que deben considerarse al mantenerlo o desplegarlo; no presupone una certificación de seguridad ni de cumplimiento sanitario o tributario.

## Contenido

- [Alcance y roles](#alcance-y-roles)
- [Tecnologías y dependencias](#tecnologías-y-dependencias)
- [Instalación y configuración](#instalación-y-configuración)
- [Arquitectura y estructura](#arquitectura-y-estructura)
- [Código limpio, patrones y SOLID](#código-limpio-patrones-y-solid)
- [Modelo de datos e identidad](#modelo-de-datos-e-identidad)
- [Contratos HTTP](#contratos-http)
- [Flujos de negocio](#flujos-de-negocio)
- [Tiempo real con Socket.IO](#tiempo-real-con-socketio)
- [Seguridad implementada](#seguridad-implementada)
- [Pruebas y mantenimiento](#pruebas-y-mantenimiento)
- [Despliegue y operación](#despliegue-y-operación)
- [Límites conocidos y evolución](#límites-conocidos-y-evolución)

## Alcance y roles

| Rol | Responsabilidad y límites principales |
| --- | --- |
| `administrador` | Gestiona usuarios, catálogos e inventario; consulta clientes, atenciones y pagos globales; opera los reportes administrativos. No administra historias clínicas por las rutas exclusivas del médico. |
| `doctor` | Consulta y gestiona sus propias citas, tratamientos e historias clínicas; registra tratamientos y descuenta insumos de su especialidad. Su nombre editable nunca concede propiedad sobre registros de otra cuenta. |
| `cosmiatra` | Opera citas y cobros como recepción, registra sus propios tratamientos, consulta su historial de atenciones y el reporte operativo de servicios de ambas especialidades. No obtiene las respuestas de las historias clínicas por ese reporte. |

La autorización combina políticas de rol en las rutas y comprobaciones de propiedad en los servicios. Ocultar un botón en el frontend no sustituye estos controles del servidor.

## Tecnologías y dependencias

Las versiones siguientes son las resueltas actualmente en `package-lock.json`, no una recomendación de actualización automática. `package.json` contiene los rangos admitidos y `npm ci` instala el árbol exacto del lockfile.

| Dependencia | Versión resuelta | Uso en el proyecto |
| --- | --- | --- |
| `express` | `4.22.3` | API HTTP, routers y composición de middleware. |
| `mongoose` | `8.24.5` | Conexión MongoDB, esquemas, validadores, índices y consultas. |
| `socket.io` | `4.8.4` | Notificaciones segmentadas por rol y cuenta. |
| `jsonwebtoken` | `9.0.3` | JWT de sesión y recuperación de contraseña. |
| `bcryptjs` | `3.0.3` | Hash y comparación de contraseñas. |
| `helmet` | `8.3.0` | Cabeceras HTTP de seguridad. |
| `cors` | `2.8.6` | Lista explícita de orígenes permitidos. |
| `multer` | `2.4.0` | Recepción de imágenes multipart en archivos temporales. |
| `cloudinary` | `2.11.0` | Almacenamiento y transformación de avatares, firmas e imágenes de tratamientos. |
| `@getbrevo/brevo` | `3.0.4` | Correo transaccional de bienvenida y recuperación. |
| `dotenv` | `17.4.2` | Carga local de configuración desde `.env`. |
| `nodemon` | `3.1.14` | Reinicio del servidor en desarrollo; dependencia de desarrollo. |

Las pruebas usan `node:test` y `node:assert/strict`; la generación aleatoria utiliza `node:crypto`. No se necesita Jest para la suite existente. El backend no incorpora un generador de PDF: el cliente construye el documento a partir de la historia y los metadatos profesionales recibidos de la API.

## Instalación y configuración

### Requisitos

- Node.js LTS compatible con las dependencias del lockfile y con `node:test`. El repositorio no fija una versión mediante `engines` o `.nvmrc`; mantenga la misma versión validada en desarrollo, pruebas y producción.
- npm y una instancia MongoDB accesible desde el servidor.
- Cloudinary para funciones de imágenes y Brevo con un remitente autorizado para correo.
- El frontend configurado para apuntar a esta API y al mismo servidor Socket.IO.

Desde `Backend_Estetico`:

```bash
cp .env.example .env
npm ci
npm test
npm run dev
```

Edite `.env` antes de iniciar; los valores de ejemplo no son credenciales válidas. El servidor escucha en `http://localhost:5000` por defecto y la API tiene el prefijo `/api`. Nodemon reinicia los cambios en desarrollo; `npm start` inicia Node sin ese observador.

### Variables de entorno

| Variable | Requisito | Descripción |
| --- | --- | --- |
| `NODE_ENV` | Opcional | `development`, `test` o `production`; activa las comprobaciones estrictas de producción. |
| `PORT` | Opcional | Puerto HTTP; valor predeterminado `5000`. |
| `MONGO_URI` | Necesaria para funcionar | Conexión MongoDB con credenciales de privilegio mínimo. |
| `JWT_SECRET` | Necesaria para autenticar | Secreto exclusivo, largo y aleatorio por entorno; mínimo 32 caracteres comprobado en producción. |
| `FRONTEND_URL` | Obligatoria en producción | URL HTTPS del frontend; origen CORS y base de los enlaces de recuperación. En desarrollo existe un fallback local para recuperación. |
| `CORS_ORIGINS` | Opcional | Orígenes adicionales separados por coma; use orígenes exactos, sin rutas ni comodines. En producción deben ser HTTPS. |
| `TRUST_PROXY` | Opcional | `true` habilita confianza en un salto de proxy; úselo únicamente si esa topología está controlada. Por defecto no se confía en el proxy. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Para imágenes | Credenciales de la integración de archivos. |
| `BREVO_API_KEY`, `MAIL_FROM` | Para correo | API key y remitente; `MAIL_FROM` admite `Nombre <correo@example.com>`. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Bootstrap opcional | Crea la cuenta inicial si ese correo todavía no existe. La contraseña debe tener al menos 12 caracteres en producción; retire la configuración después del primer arranque. |
| `DEFAULT_AVATAR_URL` | Opcional | URL de avatar predeterminado. |

La plantilla [`.env.example`](.env.example) no contiene secretos. Nunca publique `.env`, tokens, copias de base de datos o credenciales en Git, tickets, capturas o logs. En producción utilice el gestor de secretos de la plataforma. `assertRuntimeConfiguration()` valida la configuración crítica antes de iniciar el servidor en modo producción.

### Comandos disponibles

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Ejecuta `nodemon src/server.js`. |
| `npm start` | Ejecuta `node src/server.js`. |
| `npm test` | Descubre y ejecuta las pruebas mediante `node --test`. |
| `node src/services/historiaClinica.service.test.js` | Ejecuta una regresión concreta sin iniciar el servidor. |
| `npm audit --omit=dev` | Consulta vulnerabilidades publicadas de dependencias de producción; requiere acceso al registro. |

No existen actualmente scripts de compilación, lint, cobertura, migración general ni contenedores/CI declarados en este repositorio. No dé por hecho que un comando del frontend existe también aquí.

## Arquitectura y estructura

### Capas y flujo de una petición

El flujo habitual es `ruta → middleware → controlador → servicio → repositorio → modelo MongoDB`. El controlador transforma la salida del servicio en una respuesta HTTP y, si corresponde, emite un evento a través del emisor centralizado.

| Capa | Responsabilidad | Ejemplo |
| --- | --- | --- |
| `routes` | Define método, URL, autenticación y política de rol. | `historiaClinica.routes.js` reserva el guardado al doctor. |
| `middlewares` | Aplica controles transversales antes del caso de uso. | `authJwt`, `authorizeRole`, límites de solicitudes y uploads. |
| `controllers` | Extrae/selecciona entradas HTTP, delega y presenta respuestas/eventos. | `bodyToInput()` selecciona únicamente campos admitidos de la historia. |
| `services` | Ejecuta reglas de negocio, propiedad y coordinación de varias operaciones. | `guardarHistoriaClinica()` distingue borrador/finalización y sincroniza identidad. |
| `repositories` | Encapsula consultas, proyecciones y escrituras de persistencia. | `findByIdAndMedico()` limita una historia a su propietario. |
| `models` | Define estructura persistida, validadores e índices Mongoose. | `HistoriaClinica.model.js` evita duplicar el origen y la clave por médico. |
| `helpers`, `errors`, `constants` | Centraliza validaciones, contratos y comportamiento compartido. | `clinicalHistoryValidator`, `AppError`, roles y estados. |
| `config`, `utils` | Integra servicios externos y tareas de infraestructura. | MongoDB, Cloudinary, Brevo y creación inicial de administrador. |

```text
src/
├── app.js                    # Express, límites, seguridad, routers y errores
├── server.js                 # Arranque: configuración, HTTP, MongoDB y Socket.IO
├── config/                   # MongoDB, Cloudinary y validación de entorno
├── constants/                # Roles, estados, expiraciones y valores compartidos
├── controllers/              # Adaptación HTTP y emisión de eventos
├── emails/                   # Plantillas HTML transaccionales
├── errors/                   # AppError operacional
├── helpers/                  # Validadores, identidad, archivos y modelos de lectura
├── middlewares/              # JWT, RBAC, sockets, seguridad, uploads y rate limits
├── models/                   # Esquemas e índices Mongoose
├── repositories/             # Persistencia de cada módulo e identidad transversal
├── routes/                   # Endpoints y políticas de entrada
├── services/                 # Casos de uso y reglas del negocio
└── utils/                    # Brevo, bootstrap y utilidades auxiliares
```

Las pruebas `*.test.js` están junto a los módulos que verifican. `uploads/` es almacenamiento temporal ignorado por Git, no un repositorio público de documentos. `app.js` exporta la aplicación sin abrir un puerto; `server.js` compone la infraestructura y la inicia.

Es una arquitectura por capas, no una implementación completa de Clean Architecture o arquitectura hexagonal: los servicios importan repositorios concretos y algunos integran directamente Cloudinary; las rutas de upload todavía contienen orquestación de infraestructura. No hay un contenedor de inyección de dependencias, interfaces TypeScript ni un bus de eventos persistente.

## Código limpio, patrones y SOLID

### Prácticas de mantenimiento

- Mantenga las reglas de dominio fuera de la presentación HTTP y las consultas Mongoose dentro de repositorios.
- Seleccione las entradas admitidas; no pase indiscriminadamente `req.body` a una actualización. Rol, profesional autenticado y propiedad se resuelven en el servidor.
- Use nombres descriptivos, funciones de validación pequeñas y constantes compartidas; evite duplicar reglas de identidad, fechas o permisos en cada módulo.
- Lance `AppError` para fallos esperados y utilice `asyncHandler` en handlers asíncronos. Los errores operacionales se presentan con mensajes controlados; los fallos internos no deben revelar trazas al cliente.
- Conserve IDs, eventos y formatos consumidos por el frontend. Una refactorización estructural requiere pruebas de regresión, no cambios silenciosos de contrato.
- Extraiga utilidades cuando exista una responsabilidad reutilizable real; no convierta cada función pequeña en una abstracción sin necesidad.

### Patrones presentes

| Patrón o enfoque | Aplicación concreta |
| --- | --- |
| Arquitectura por capas / Service Layer | Los servicios coordinan los casos de uso; controllers y rutas no deciden la propiedad de una atención por un nombre editable. |
| Repository | Cada repositorio agrupa consultas y proyecciones de su módulo; los tests sustituyen sus funciones para verificar reglas sin una base real. |
| Cadena de middleware | Express compone seguridad, autenticación, rol, límites, multipart y errores. |
| Adaptación de entradas y salidas | `bodyToInput()` y `serializeHistory()` traducen el contrato HTTP al formato de dominio/persistencia, sin una librería DTO adicional. |
| Adaptadores de infraestructura | `sendEmail`, configuración Cloudinary y conexión MongoDB concentran integraciones; no todas están completamente desacopladas. |
| Publicación/suscripción | Socket.IO comunica cambios a salas autorizadas; `realtimeEmitter` centraliza audiencias y minimiza datos. |
| Modelo de lectura | `attentionHistory` combina tratamientos y citas atendidas para consulta sin crear tratamientos ficticios. Es una separación de lectura puntual, no CQRS completo. |
| Guardas optimistas y compensación | La propagación de identidad comprueba valores previos y evidencia; ante error intenta revertir únicamente su propia escritura. No equivale a una transacción MongoDB multidocumento. |
| Idempotencia específica | Las citas pueden incorporar `idempotencyKey`, con índice único y reutilización del resultado. No es una garantía global para todos los endpoints. |

### Aplicación de SOLID

| Principio | Cómo se aplica y alcance real |
| --- | --- |
| S — Responsabilidad única | Rutas declaran acceso; controllers adaptan HTTP; servicios resuelven negocio; repositorios persisten; helpers validan. Las rutas de upload y servicios grandes son puntos de mejora gradual. |
| O — Abierto/cerrado | Validadores, constantes y emisores compartidos permiten agregar reglas o eventos en límites concretos. No todas las extensiones son configurables sin modificar código existente. |
| L — Sustitución de Liskov | No hay jerarquías de clases de dominio donde demostrar sustitución formal. En pruebas, las funciones sustitutas conservan los contratos asíncronos de repositorio; no se afirma una implementación general de LSP. |
| I — Segregación de interfaces | Los módulos exponen operaciones específicas y las consultas operativas usan proyecciones mínimas. Son interfaces de módulos JavaScript, no interfaces formales de TypeScript. |
| D — Inversión de dependencias | El servicio evita usar directamente modelos Mongoose en gran parte del flujo gracias a los repositorios. Aún importa implementaciones concretas; la inyección explícita de puertos/adaptadores es una evolución, no una característica ya completada. |

El objetivo es mejorar estas fronteras conservando la funcionalidad; no introducir patrones por nombre ni prometer propiedades que el código todavía no garantiza.

## Modelo de datos e identidad

| Modelo | Contenido y relaciones principales |
| --- | --- |
| `Usuario` | Nombre, correo único, hash de contraseña, rol, estado activo, avatar, CMP, firma y fecha de cambio de contraseña; nombres anteriores internos del profesional. |
| `Cita` | Cliente, `pacienteId` opcional, profesional por ID, especialidad, servicios, fecha, estado y clave de idempotencia opcional. |
| `Tratamiento` | Identidad y contacto del paciente, servicios, observaciones, insumos e imágenes; `profesionalId` y referencia opcional única a cita. |
| `HistoriaClinica` | Médico propietario, origen cita/tratamiento, identidad del paciente, respuestas del formulario, paso, estado, próximo control y metadatos del médico. |
| `Pago` | Referencia a cita, paciente, servicios/precios, método, total, serie, correlativo y estado. |
| `Inventario` | Rol profesional, tipo `insumo`/`servicio`, nombre, stock y umbral. |
| `Servicio` | Catálogo heredado usado junto con servicios de inventario al validar la especialidad de una cita. No confundirlo con un catálogo de precios autoritativo. |

No existe una colección `Paciente` independiente: `pacienteId` es un identificador estable compartido entre los registros. El nombre es un dato editable de visualización, no una clave de seguridad ni una prueba suficiente para unir personas. Los índices únicos/sparse de origen y las claves por médico ayudan a evitar duplicados; las colecciones aún requieren control de concurrencia adicional en operaciones compuestas.

### Cambios del nombre del cliente

Guardar y Finalizar ejecutan `patientIdentity.service` después de verificar la cita/tratamiento original del médico. La corrección se propaga a citas, tratamientos, pagos y al nombre equivalente del formulario, incluidos metadatos de historias ya finalizadas del mismo cliente; no cambia estados, fechas, servicios, importes ni otras respuestas clínicas.

Las citas vinculadas se actualizan en todos los estados: `pendiente`, `atendido`, `aplazado` y `cancelado`. Los cambios de estado conservan la identidad. Una cita nominal antigua sin vínculo no se adopta solo porque tenga el mismo nombre: se exige evidencia persistida, sin conflictos de identidad, contacto/DNI o sexo. La recuperación automática de citas atendidas requiere una correspondencia única de paciente, profesional, rol, día de Lima y multiconjunto de servicios.

El autocompletado puede devolver `citaPacienteId` para un cliente identificado. `cita.service` valida formato, existencia, permisos, identidad y nombre vigente de esa referencia antes de reutilizar el cliente. Un `pacienteId` arbitrario del navegador no concede identidad ni propiedad. Alias y nombres anteriores son metadatos internos; no permiten ver historias de otro médico ni fusionar homónimos.

La respuesta de guardado informa `pacienteActualizado.citasSinIdentidadVerificada` si quedan reservas antiguas sin evidencia. Las escrituras verifican valores anteriores y la evidencia usada; ante error se compensan solo valores escritos por esa operación, protegiendo cambios concurrentes de otras sesiones.

### Cambios del perfil profesional

La cuenta por ID es la fuente de identidad del doctor/cosmiatra. Cambiar el nombre actualiza las instantáneas de sus tratamientos y las lecturas presentan el nombre vigente. Para el doctor también se sincronizan nombre, CMP y URL de firma en sus historias, sin cambiar respuestas clínicas. El frontend debe regenerar el documento para incorporar estos metadatos: un PDF ya descargado es un archivo local y no puede modificarse remotamente.

Las lecturas reconcilian registros heredados únicamente con el propietario inmutable de una cita vinculada; nombres y alias no conceden propiedad. Esta reconciliación puede realizar escrituras correctivas en lecturas de tratamientos, por lo que no debe confundirse con una migración puramente de lectura.

### Reparaciones internas de datos heredados

Las opciones siguientes no se aceptan en los controladores HTTP. Son herramientas internas para un operador autorizado, con respaldo, evidencia documentada y revisión de alcance:

- `synchronizePatientName({ ..., dryRun: true })` permite revisar conteos y exclusiones sin escribir.
- `approvedPreviousNames` exige `allowLegacyAliasMigration: true` y una historia/tratamiento original verificable; conserva controles de contacto/DNI, conflictos y guardas de escritura.
- `approvedAppointmentIds` admite como máximo 100 IDs expresamente revisados, también con `allowLegacyAliasMigration: true`. Valida cada cita contra candidatos persistidos, nombres conocidos y ausencia de otra identidad. Puede vincular reservas aplazadas/canceladas sin alterar su estado ni inventar tratamientos.
- `reconciliarIdentidadesProfesionales({ dryRun: true, allowNameInference: true })` analiza asignaciones únicas del mismo rol considerando todas las cuentas, incluidas las suspendidas. Las extensiones/acortamientos de nombre requieren al menos dos palabras completas; casos más débiles necesitan `approvedLegacyNames` con asignación explícita verificada. Ambigüedades permanecen sin asignar.

No ejecute cambios masivos por texto ni teléfonos compartidos. Un `dryRun` valida un plan, pero no sustituye autorización, respaldo ni revisión de cambios concurrentes antes de aplicar.

## Contratos HTTP

Todas las rutas se montan bajo `/api`. Las protegidas reciben `Authorization: Bearer <JWT>`; el servidor toma la cuenta y su rol vigente de la base de datos. La siguiente tabla es un mapa funcional, no una especificación OpenAPI generada.

| Módulo | Rutas principales | Política |
| --- | --- | --- |
| Autenticación | `POST /auth/login`, `/auth/reset-password`, `/auth/change-password` | Entrada pública limitada; cambio requiere el token de recuperación válido. |
| Usuarios | `POST /usuarios/register`, `GET /usuarios`, `PATCH /usuarios/:id/suspender`, `DELETE /usuarios/:id` | Administrador; no puede suspender/eliminar una cuenta de administrador por estos casos de uso. |
| Perfil y profesionales | `PUT /usuarios/:id`, `GET /usuarios/profesionales` | Cuenta propia para actualizar perfil; consulta autenticada de profesionales. |
| Citas | `GET/POST /citas`, `GET /citas/buscar?nombre=...`, `PUT/DELETE /citas/:id`, `PATCH` o `PUT /citas/:id/estado` | Personal autenticado; el doctor solo gestiona citas propias. |
| Tratamientos | `GET/POST /tratamientos`, `GET /tratamientos/buscar/:nombre` | Alta para doctor/cosmiatra; administrador consulta globalmente y profesionales consultan sus registros. |
| Historial de atenciones | `GET /tratamientos/historial-atenciones` | Administrador global; cada profesional recibe sus atenciones. |
| Reporte de servicios | `GET /tratamientos/reporte-servicios` | Cosmiatra/administrador; ambas especialidades con proyección operativa mínima. |
| Inventario | `GET /inventario/:rol?tipo=insumo`, `POST /inventario`, `PUT/DELETE /inventario/:id`, `PUT /inventario/descontar` | Lectura del rol propio o administrador; cosmiatra puede consultar nombres de servicios de ambas especialidades para reservar. Catálogo administrador; descuento del rol propio o administrador. |
| Pagos | `GET /pagos`, `GET /pagos/:citaId`, `POST /pagos` | Registro cosmiatra/administrador; lectura autenticada, restringida a citas propias para doctor. |
| Historia clínica | `GET/PUT /historias-clinicas`, `GET/PUT /historias-clinicas/citas/:citaId`, `GET /historias-clinicas/:id`, `GET /historias-clinicas/finalizadas` | Doctor propietario, mediante identidad del origen y del documento. |
| Próximos controles | `GET /historias-clinicas/proximos-controles` | Cosmiatra/administrador; controles finalizados cuya fecha no ha pasado. |
| Archivos | `POST /upload`, `POST /upload/firma` | Cuenta autenticada; multipart `file`, límites y validación. La UI reserva CMP/firma al doctor; la ruta de firma no aplica un middleware exclusivo de ese rol. |

Las respuestas operacionales usan `{ "message": "..." }`; la validación clínica puede añadir `details.errors` o `details.missingSections`. Hay respuestas específicas por módulo, no una envoltura universal. Se emplean, entre otros, `400` para entrada inválida, `401/403` para autenticación/permisos, `404` para recursos no encontrados, `409` para conflictos, `422` para finalización incompleta y `429` para límites de solicitudes. Los fallos internos no deben exponer secretos o trazas.

## Flujos de negocio

### Registro de citas y tratamientos

La cita verifica el rol del profesional y que los servicios pertenezcan al catálogo de esa especialidad. Una edición que conserva el rol puede preservar servicios históricos de esa misma cita aunque ya no figuren en el catálogo. Al registrar un tratamiento, el profesional se deriva del JWT; una cita explícita debe ser propia y pendiente. La reserva condicional de la cita y el índice único del tratamiento por cita reducen duplicados; si falla el registro se intenta compensar esa reserva.

### Guardado y finalización de la historia

El borrador puede conservar respuestas incompletas, pero no datos estructuralmente inválidos. El servidor valida tamaño, anidamiento, campos y formatos, DNI, valores numéricos, mayoría de edad y coherencia con nacimiento. Finalizar exige además completar las secciones y requisitos condicionales; la sección gineco-obstétrica se exige según el sexo del paciente. El médico, CMP y firma se toman de la cuenta autenticada.

Una historia finalizada no admite editar respuestas por el guardado ordinario. La sincronización de identidad del cliente y del perfil profesional actualiza únicamente sus campos de identificación correspondientes. El próximo control produce un aviso operativo; no crea automáticamente una nueva cita ni reemplaza el proceso de reserva de recepción.

### Citas atendidas sin tratamiento

Una cita atendida puede tener un pago y no un `Tratamiento` todavía. `attentionHistory` crea un modelo de lectura compartido por historial y reporte, sin insertar documentos ni inventar observaciones, insumos o imágenes. Las filas operativas se identifican con `_id: cita:<id>`, `citaId`, `origenRegistro: cita` y `registroTratamientoPendiente: true`; no deben enviarse como IDs de tratamiento a escrituras clínicas.

La referencia explícita de cita tiene prioridad; las coincidencias heredadas requieren correspondencia única de paciente, profesional, rol, día de Lima y multiconjunto de servicios. El nombre participa solo cuando ambos registros carecen de identidad estable. Al aparecer el tratamiento real, este sustituye a la fila operativa. La fecha original se conserva; la hora de cita se añade como metadato de lectura.

### Registro del pago

El servidor comprueba que la cita exista y esté atendida, coincidan paciente y servicios, los precios sean numéricos no negativos, el total iguale su suma y no exista un pago previo. El correlativo se calcula a partir de la última boleta. Los precios siguen siendo proporcionados por el cliente: las validaciones no los convierten en un catálogo fiscal autoritativo ni garantizan atomicidad bajo peticiones simultáneas.

## Tiempo real con Socket.IO

El cliente se conecta al servidor HTTP, no a `/api`, con el token vigente:

```js
io(SOCKET_URL, { auth: { token } });
```

`socketAuth` valida firma, cuenta activa y fecha de cambio de contraseña antes de admitir la conexión. El servidor une al socket a `role:<rol>` y `user:<id>`. Los controllers publican mediante [`src/helpers/realtimeEmitter.js`](src/helpers/realtimeEmitter.js), no por difusión indiscriminada.

| Eventos | Audiencia principal |
| --- | --- |
| `nuevaCita`, `citaActualizada`, `estadoCitaActualizado`, `citaEliminada` | Administración/recepción y médico de la cita cuando corresponde. |
| `tratamientoActualizado` | Administración y profesional propietario. |
| `inventarioActualizado` | Administración y especialidad afectada. |
| `nuevoPago`, `historiaClinicaFinalizada` | Administración y recepción. |
| `profesionalActualizado` | Roles autenticados, con identidad pública mínima. |
| `pacienteActualizado` | Administración/recepción y profesionales afectados; identidad/nombre, no respuestas clínicas. |

HTTP y MongoDB siguen siendo la fuente de verdad. Los eventos avisan de cambios, no proporcionan una cola durable ni recuperación garantizada de mensajes perdidos. Suspender/eliminar una cuenta o cambiar su contraseña desconecta sus sockets del proceso local. Varias réplicas necesitan un adaptador compartido y una estrategia coordinada de sesiones/revalidación.

## Seguridad implementada

- JWT de sesión de un día; cada petición HTTP verifica la cuenta, estado activo, rol actual y cambio de contraseña. El rol del token no conserva privilegios revocados.
- Contraseñas hasheadas con bcryptjs y credenciales temporales generadas mediante `crypto.randomBytes`. El flujo actual envía una contraseña temporal por correo; un flujo de activación con token es una mejora pendiente.
- Recuperación de 30 minutos, propósito explícito y firma vinculada al hash actual de contraseña. Tras cambiarla, el token de recuperación anterior deja de validar y las sesiones anteriores se rechazan.
- Helmet, `x-powered-by` deshabilitado, CORS con allowlist, consultas simples, cuerpos JSON/formulario de hasta 1 MB, rechazo recursivo de claves `$...` o con puntos y respuestas API `no-store`.
- Login: 10 solicitudes/15 minutos; recuperación/cambio: 5/hora; avatar/firma: 30/15 minutos, por proceso e IP, con `Retry-After` y `RateLimit-*`. El upload de tratamientos aplica límites multipart propios, no ese limitador de avatar/firma.
- Imágenes JPG/PNG/WEBP con filtro MIME y verificación de cabecera binaria antes de Cloudinary. Avatar/firma: un archivo de hasta 2 MB; tratamientos: hasta 5 archivos de 5 MB cada uno. Los temporales se eliminan tras procesar; la validación de cabecera no equivale a un antivirus ni a una inspección integral del archivo.
- URLs de avatar/firma modificadas por la carga controlada, no por una URL arbitraria en `PUT /usuarios/:id`. Las variables HTML de correos se escapan y el enlace de recuperación usa la configuración del servidor, no el `Origin` recibido.
- Propiedad por IDs y proyecciones mínimas para reportes; referencias internas de identidad/migración no se aceptan como opciones administrativas desde la API pública.

CORS no autentica solicitudes y `secure_url` de Cloudinary significa transporte HTTPS, no acceso privado. Una firma subida es una imagen de firma manuscrita; no constituye una firma criptográfica basada en certificados. Estas defensas no sustituyen auditorías, cifrado de infraestructura, autorización de archivos, backups ni revisión periódica de dependencias.

## Pruebas y mantenimiento

```bash
npm test
node src/helpers/clinicalHistoryValidator.test.js
node src/services/patientNameAllAppointmentStates.test.js
node -e "require('./src/app'); console.log('App carga correctamente')"
git diff --check
```

`node:test` cubre helpers puros, contratos de servicios/repositorios, seguridad y emisores con dobles de funciones. La suite existente no es una prueba end-to-end del navegador ni una certificación de concurrencia contra MongoDB, Cloudinary o Brevo reales.

| Área | Ejemplos de regresiones |
| --- | --- |
| Historia clínica | `clinicalHistoryValidator.test.js`, `clinicalHistoryIdentity.test.js`, `historiaClinica.service.test.js`. |
| Identidad del paciente | `patientIdentity.test.js`, `patientIdentity.service.test.js`, `appointmentPatientIdentity.test.js`, `patientNamePropagation.test.js`. |
| Estados y reparación revisada | `patientNameAllAppointmentStates.test.js`, `reviewedAppointmentIdentity.test.js`. |
| Profesional y perfil | `professionalIdentity.service.test.js`, `user.service.test.js`, `tratamiento.repository.test.js`. |
| Historial/reporte | `attentionHistory.test.js`, `tratamiento.service.test.js`. |
| Seguridad e infraestructura | `security.test.js`, `rateLimit.test.js`, `runtimeConfig.test.js`, `imageFileValidator.test.js`, `emailTemplateRenderer.test.js`, `realtimeEmitter.test.js`. |
| Inventario | `inventario.controller.test.js`. |

Para cada cambio de negocio, agregue casos de éxito, datos inválidos, recurso ajeno, homónimos/identidades en conflicto cuando corresponda y conservación de estado/eventos. Ejecute integración en una base aislada; no use datos clínicos reales ni credenciales de producción en fixtures. Pruebe conjuntamente cliente y API después de modificar contratos.

Si actualiza dependencias, revise el cambio de lockfile, ejecute la suite y valide login, sockets, uploads, tratamientos, pagos, borrador/finalización y generación del PDF en el frontend. No aplique `npm audit fix --force` automáticamente sobre una entrega funcional.

## Despliegue y operación

1. Instale el lockfile con `npm ci --omit=dev` en el entorno de ejecución, tras validar las pruebas en una etapa con dependencias de desarrollo. Inicie con `NODE_ENV=production` y `npm start`; no publique Nodemon.
2. Configure `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, Cloudinary y Brevo en un secret manager. Use secretos distintos por entorno y retire las credenciales de bootstrap después de crear el administrador.
3. Sirva la API y Socket.IO con HTTPS mediante un proxy inverso controlado; permita upgrade WebSocket. Configure los orígenes exactos y `TRUST_PROXY` solo si un salto confiable describe realmente el despliegue.
4. Aplique límites de solicitudes, tamaño y conexiones también en el proxy/API gateway. Para múltiples instancias, agregue limitación distribuida y adaptador Socket.IO; los mecanismos locales no coordinan réplicas.
5. Proporcione un directorio temporal `uploads/` escribible, con permisos mínimos, control de capacidad y limpieza operativa de archivos huérfanos tras reinicios o errores.
6. Restrinja MongoDB a la red del servicio, cuentas de privilegio mínimo y conexiones seguras. Configure backups cifrados, pruebas de restauración y retención acorde con datos clínicos y pagos.
7. Proteja imágenes clínicas y firmas mediante acceso Cloudinary privado/autenticado o un proxy firmado si lo exige su política. Las URLs públicas actuales no aplican autorización por usuario.
8. Centralice logs con redacción de secretos y datos sensibles; el código aún puede registrar errores/respuestas de proveedor y correos de bootstrap. Configure alertas de errores HTTP, disponibilidad de MongoDB, fallos de correo, uploads y recursos.
9. Valide en staging una sesión de cada rol, recursos ajenos, reconexión socket, pago, carga de firma y flujo de historia completo. Mantenga un plan de rollback de aplicación y respaldo antes de migrar datos.

No se incluyen actualmente Docker, orquestación, pipeline CI/CD, endpoint de salud, trazabilidad regulatoria inmutable ni un procedimiento automatizado de migraciones generales. Documente estas decisiones al incorporarlas; no suponga que `npm start` por sí solo proporciona alta disponibilidad.

### Diagnóstico básico

| Síntoma | Comprobación |
| --- | --- |
| No inicia en producción | Variables obligatorias, longitud del secreto y URLs HTTPS; después conexión MongoDB. |
| El navegador bloquea la API | Origen exacto del frontend, CORS y URL base; no deshabilite autenticación para resolver CORS. |
| Sesión rechazada tras editar cuenta | Estado activo, rol vigente, contraseña modificada y token actualizado. |
| No llegan eventos | Token del handshake, dirección del servidor, proxy WebSocket, sala/rol y adaptación compartida si hay réplicas. |
| Falla correo o recuperación | API key de Brevo, remitente autorizado y `FRONTEND_URL`; no use un `Origin` del cliente como base del enlace. |
| Falla imagen o firma | Campo multipart, tipo/cabecera, tamaño, permisos/capacidad de temporales y credenciales Cloudinary. |
| Un registro conserva un nombre antiguo | ID y origen persistidos, alias/evidencia y conteos de exclusión; revise la identidad, no haga una sustitución global por texto. |

## Límites conocidos y evolución

- Los descuentos de inventario y el cálculo del correlativo de boletas requieren operaciones atómicas/transacciones para alta concurrencia. La comprobación de pago previo por cita no sustituye una restricción única o transacción integral bajo dos peticiones simultáneas.
- Falta un catálogo de precios autoritativo y versionado en servidor. El cálculo actual comprueba coherencia aritmética, no validez comercial/fiscal del precio enviado por el cliente.
- La propagación de identidad del cliente usa guardas/compensación, y la sincronización de perfil también coordina varias escrituras sin una transacción integral. Ninguna constituye una unidad de trabajo ACID; deben probarse fallos parciales, escrituras concurrentes y recuperación operativa.
- Algunos datos heredados no tienen identidad verificable. Dejarlos sin fusionar es una protección deliberada; una entidad de paciente independiente y migraciones revisadas pueden mejorar la trazabilidad sin unir homónimos.
- La generación de PDF es del frontend y las firmas son imágenes. No hay almacenamiento/versionado backend del PDF ni firma electrónica criptográfica. Los documentos descargados previamente no cambian al actualizar el perfil.
- Los JWT del frontend se almacenan en `localStorage` por compatibilidad; una migración a cookies `HttpOnly` requiere diseño CSRF y un cambio coordinado cliente/API. La política actual de contraseña mínima de seis caracteres debe revisarse antes de requisitos más estrictos.
- La limitación por proceso y la revocación local de sockets no cubren por sí solas varias réplicas. Se necesita infraestructura compartida y una estrategia de revalidación de sesiones largas.
- No se declara cobertura mínima, suite E2E, OpenAPI, CI/CD ni auditoría de acciones clínicas inmutable. La separación por capas y las pruebas actuales facilitan incorporarlas, pero no las reemplazan.

La prioridad de mantenimiento es conservar contratos y comportamiento, reforzar los límites de autorización y datos, y evolucionar de forma incremental con pruebas. Ningún patrón de diseño, README o conjunto de pruebas garantiza por sí solo inmunidad ante ataques o cumplimiento normativo.
