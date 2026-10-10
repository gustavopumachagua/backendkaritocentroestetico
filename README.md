# KARITO BEAUTY ESTHETIC CENTER S.A.C. · Backend

API REST y canal Socket.IO para la operación clínica y administrativa de KARITO BEAUTY ESTHETIC CENTER S.A.C. Gestiona autenticación, usuarios, citas, tratamientos, inventario, pagos, historias clínicas, archivos y notificaciones en tiempo real.

El cliente React se encuentra en `../Web_Estetico`.

## Inicio rápido

Requisitos: Node.js LTS, npm y una instancia MongoDB.

```bash
cp .env.example .env
npm ci
npm test
npm run dev
```

El servidor escucha en `http://localhost:5000` por defecto. Complete todas las credenciales reales solo en `.env` o, preferiblemente, en el gestor de secretos de su plataforma. `.env` nunca debe versionarse.

## Variables de entorno

| Variable | Requerida | Propósito |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test` o `production`. |
| `PORT` | No | Puerto HTTP; por defecto `5000`. |
| `MONGO_URI` | Sí | Cadena de conexión a MongoDB. |
| `JWT_SECRET` | Sí | Secreto largo, aleatorio y exclusivo por entorno para firmar sesiones. |
| `FRONTEND_URL` | Sí en producción | Origen HTTPS exacto del frontend y base segura de enlaces de reset. |
| `CORS_ORIGINS` | No | Orígenes HTTPS extra separados por coma en producción. |
| `TRUST_PROXY` | No | Use `true` solo detrás de un proxy inverso de confianza. |
| `CLOUDINARY_*` | Sí para imágenes | Credenciales de Cloudinary. |
| `BREVO_API_KEY`, `MAIL_FROM` | Sí para correo | Correo transaccional. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Opcional | Administrador de bootstrap; úselo solo con un secreto fuerte y rótelo después. |
| `DEFAULT_AVATAR_URL` | No | Avatar predeterminado. |

Revise el archivo [`.env.example`](.env.example) para una plantilla sin secretos.

## Arquitectura

```text
src/
├── app.js                  # Configuración de Express y composición de rutas
├── server.js               # HTTP, MongoDB y Socket.IO
├── config/                 # Adaptadores de infraestructura (MongoDB, Cloudinary)
├── constants/              # Valores de dominio compartidos
├── controllers/            # Orquestación HTTP y eventos
├── errors/                 # AppError operacional
├── helpers/                # Validación, plantillas, archivos y utilidades puras
├── middlewares/            # Auth, RBAC, seguridad, uploads y rate limits
├── models/                 # Esquemas Mongoose
├── repositories/           # Consultas y persistencia por agregado
├── routes/                 # Declaración de endpoints y políticas de acceso
├── services/               # Casos de uso y reglas de negocio
└── utils/                  # Integraciones auxiliares
```

El flujo normal es `route → middleware → controller → service → repository → model`. Las rutas contienen política de acceso; los servicios verifican reglas de negocio y propiedad del recurso; los repositorios concentran consultas Mongoose. Esta separación favorece SRP, DRY, Dependency Inversion en los límites de infraestructura y pruebas focalizadas.

## Módulos y contratos HTTP

Todas las rutas están bajo `/api`. Salvo autenticación, requieren `Authorization: Bearer <JWT>`.

| Módulo | Endpoints principales | Acceso |
| --- | --- | --- |
| Auth | `POST /auth/login`, `/auth/reset-password`, `/auth/change-password` | Público, con límite de intentos. |
| Usuarios | `/usuarios`, `/usuarios/register`, `/usuarios/:id` | Administración para alta/listado; perfil propio para actualización. |
| Citas | `GET/POST /citas`, `PUT/DELETE /citas/:id`, `PATCH /citas/:id/estado`, `GET /citas/buscar` | Personal autenticado; un doctor recibe y modifica solo sus propias citas. |
| Tratamientos | `GET/POST /tratamientos`, `GET /tratamientos/buscar/:nombre` | Administrador ve globalmente; profesional ve/registra sus propios tratamientos. Los nuevos registros guardan el ID inmutable del profesional derivado del JWT. |
| Historial de atenciones | `GET /tratamientos/historial-atenciones` | Administración ve el historial global; cada profesional ve solo sus atenciones. Incluye citas atendidas sin tratamiento, identificadas como filas operativas. |
| Inventario | `GET /inventario/:rol`, `POST/PUT/DELETE /inventario`, `PUT /inventario/descontar` | Lectura para personal autenticado; catálogo solo administrador; descuento limitado al rol propio o administrador. |
| Pagos | `GET /pagos`, `GET /pagos/:citaId`, `POST /pagos` | Lectura para personal; registro para cosmiatra/administrador. Se valida cita atendida, paciente y servicios. |
| Historia clínica | `/historias-clinicas`, `/historias-clinicas/finalizadas`, `/historias-clinicas/proximos-controles` | Gestión del médico propietario; controles para cosmiatra/administrador. |
| Archivos | `POST /upload`, `POST /upload/firma` | Usuario autenticado, con límite y validación de imagen. |

La API devuelve errores operacionales con `{ "message": "…" }` y, en validaciones clínicas, puede incluir `details`. Los detalles internos, trazas y secretos no se exponen al cliente.

### Identidad y correcciones del cliente

`pacienteId` es una referencia interna compartida por citas, tratamientos, pagos e historias clínicas; corregir el nombre no crea otra entidad ni cambia los IDs de las atenciones. Guardar borrador y Finalizar pasan por `patientIdentity.service`, y la API verifica primero la propiedad de la cita/tratamiento del médico. El ID enviado por el navegador nunca concede propiedad.

La propagación actualiza las instantáneas del nombre y `datosFormulario.nombreCompleto` (incluidos documentos finalizados), sin alterar estados, importes ni respuestas clínicas. Los registros heredados se adoptan con nombre anterior y contacto/DNI persistidos sin conflictos; las citas se vinculan por ID o por un único tratamiento verificado del mismo profesional, rol, día de Lima y multiconjunto de servicios. Una reserva nominal sin evidencia queda sin identificar hasta su atención; no se renombra masivamente por texto. Los alias internos permiten reconocer visitas posteriores, pero nunca otorgan acceso clínico.

El autocompletado de citas devuelve `citaPacienteId` para clientes con identidad persistida, deduplicados por `pacienteId` sin mezclar homónimos. Registrar una cita puede enviar esa referencia: `cita.service` valida su formato, existencia, permisos, identidad y nombre vigente antes de reutilizar el cliente, incluso entre especialidades. Un `pacienteId` arbitrario enviado por el navegador se ignora. Las sugerencias antiguas sin identidad siguen admitiendo reservas nominales. La recuperación automática de citas atendidas considera los nombres anteriores persistidos y conserva la exigencia de una única correspondencia; reservas ambiguas, canceladas o aplazadas sin vínculo no se fusionan por texto.

Las escrituras comprueban valores anteriores y evidencia de vinculación. Ante un fallo, se compensan únicamente los valores escritos por esa operación. La respuesta incluye `pacienteActualizado.citasSinIdentidadVerificada` cuando quedan citas nominales sin vínculo seguro. El socket `pacienteActualizado` solo anuncia identidad/nombre a administración, recepción y profesionales afectados; no transmite respuestas clínicas.

La propagación por `pacienteId` incluye todos los estados de cita: `pendiente`, `atendido`, `aplazado` y `cancelado`. Guardar y Finalizar no alteran esos estados ni fechas, servicios o importes al corregir un nombre; los cambios de estado tampoco eliminan la identidad del cliente. Regresión: `node src/services/patientNameAllAppointmentStates.test.js`.

Regresiones específicas: `node src/services/appointmentPatientIdentity.test.js`, `node src/helpers/patientIdentity.test.js` y `node src/services/patientNamePropagation.test.js`. Cubren selección de clientes existentes, autorización, homónimos, alias y propagación en Guardar/Finalizar sin crear nuevas historias.

### Citas atendidas sin registro de tratamiento

Una cita atendida puede tener un pago sin que exista todavía un `Tratamiento`. `attentionHistory` genera un modelo de lectura compartido por `/tratamientos/historial-atenciones` y `/tratamientos/reporte-servicios`, sin insertar documentos ni inventar observaciones, insumos o imágenes. Las filas operativas tienen `_id: cita:<id>`, `citaId`, `origenRegistro: cita` y `registroTratamientoPendiente: true`. No deben usarse como IDs de tratamiento en escrituras clínicas.

Las referencias explícitas de cita tienen prioridad; las coincidencias heredadas exigen una correspondencia única de paciente, profesional, rol, día de Lima y multiconjunto de servicios. Los nombres solo participan cuando ambos registros carecen de `pacienteId`; un homónimo con otra identidad nunca se fusiona. La fecha original del tratamiento se conserva y la hora real de la cita se añade como metadato de lectura. Al registrar el tratamiento real sustituye a la fila operativa. El endpoint clínico `/tratamientos` y los permisos del reporte permanecen sin cambios.

Pruebas: `node src/helpers/attentionHistory.test.js` y `node src/services/tratamiento.service.test.js` (deduplicación, límites de identidad, privacidad de proyecciones, autorización y transición de cita a tratamiento).

Regresiones específicas: `node src/helpers/patientIdentity.test.js`, `node src/services/patientIdentity.service.test.js` y `node src/services/patientNamePropagation.test.js`. Use una base de pruebas para integración; no haga cambios masivos por coincidencia de nombres ni de teléfonos compartidos en producción.

Para corregir una actualización antigua que no conservó el nombre previo, un operador puede ejecutar `synchronizePatientName` con una historia/tratamiento original verificados y `approvedPreviousNames`, exclusivamente junto con `allowLegacyAliasMigration: true`. Primero use `dryRun: true` para revisar los conteos y exclusiones sin escribir. Esta opción no se recibe en ningún endpoint y mantiene las mismas comprobaciones de contacto/DNI, conflictos y concurrencia; no autoriza fusiones nominales ni modifica respuestas clínicas.

Las citas heredadas cuyo vínculo haya sido revisado explícitamente pueden indicarse mediante `approvedAppointmentIds` (máximo 100 IDs de cita), también solo con `allowLegacyAliasMigration: true`. La reparación valida cada ID contra los candidatos persistidos, los nombres anteriores conocidos y la ausencia de otra identidad. Permite vincular reservas canceladas o aplazadas sin inventar un tratamiento, conservando sus estados y todos los demás datos. Los controladores HTTP no aceptan ninguna de estas opciones internas; no use una coincidencia nominal como confirmación de identidad. Regresión: `node src/services/reviewedAppointmentIdentity.test.js`.

## Autorización y seguridad implementada

- **JWT con estado vigente:** cada petición consulta si el usuario sigue activo, si cambió la contraseña y cuál es su rol actual. Un token con rol revocado no conserva privilegios hasta expirar; una suspensión, eliminación o cambio de contraseña desconecta las sesiones Socket.IO locales del usuario.
- **RBAC y propiedad:** inventario, citas, tratamientos y pagos aplican controles de rol en rutas y reglas de propiedad en servicios. El servidor no acepta del navegador el profesional que firma un tratamiento.
- **Sockets autenticados y segmentados:** Socket.IO valida el JWT y el estado de cuenta antes de conectar. Los sockets anónimos no reciben datos; citas, tratamientos, pagos, inventario y controles se emiten solo a las salas de rol o usuario que los necesitan.
- **CORS y headers:** Helmet, allowlist de orígenes, parser de consulta simple, límite de cuerpo JSON/formulario, bloqueo de claves Mongo peligrosas y respuestas `no-store` para datos API. En producción no se habilitan orígenes locales: solo `FRONTEND_URL` y `CORS_ORIGINS` HTTPS explícitos, validados antes de iniciar.
- **Límites de abuso:** login, reset de contraseña y cargas tienen rate limits por proceso/IP. Las respuestas incluyen `Retry-After` y cabeceras `RateLimit-*`.
- **Reset seguro:** el enlace se construye desde `FRONTEND_URL`, nunca desde el encabezado `Origin` que entrega el cliente. Las variables de plantillas de correo se escapan como HTML.
- **Subidas controladas:** MIME preliminar, límites de tamaño/campos/partes y verificación de firmas JPEG/PNG/WEBP antes de enviar a Cloudinary. Los temporales `uploads/` están ignorados por Git y se eliminan después de procesarse. El avatar y la firma solo se modifican por sus endpoints de carga, nunca mediante una URL arbitraria en el perfil.
- **Credenciales:** las contraseñas se hashean con bcryptjs y las contraseñas temporales se generan con `crypto.randomBytes`, no con `Math.random`.
- **Dependencias:** las dependencias de producción se actualizaron y las no utilizadas se retiraron. Verifique el estado con `npm audit --omit=dev` en cada entrega.

## Socket.IO

El frontend debe conectarse con el token actual:

```js
io(SOCKET_URL, { auth: { token } });
```

Eventos emitidos actualmente incluyen `nuevaCita`, `citaActualizada`, `estadoCitaActualizado`, `citaEliminada`, `tratamientoActualizado`, `inventarioActualizado`, `nuevoPago` e `historiaClinicaFinalizada`.

Los controladores mantienen el contrato de eventos existente y usan el emisor centralizado para restringir destinatarios. Al introducir un evento con PII, defina primero su audiencia y emita a `io.to("role:…")` o `io.to("user:…")`; no use difusión global. La desconexión forzada de sockets cubre el proceso local; para varias réplicas configure un adaptador Socket.IO compartido.

## Pruebas y verificación

```bash
npm test
node -e "require('./src/app'); console.log('App carga correctamente')"
npm audit --omit=dev
```

Las pruebas actuales cubren validación de historia clínica, limitación de solicitudes, firmas de archivo y escape de plantillas. Para cambios de negocio agregue pruebas de autorización y contratos de servicio antes de dividir servicios clínicos, pagos o PDF.

## Operación segura en producción

La aplicación incorpora defensa en profundidad, pero la seguridad también depende de la infraestructura. Antes de publicar:

1. Use HTTPS extremo a extremo y configure `FRONTEND_URL`/`CORS_ORIGINS` con dominios exactos.
2. Guarde `JWT_SECRET`, MongoDB, Brevo y Cloudinary en un secret manager; rote secretos tras cualquier sospecha de exposición.
3. Configure `TRUST_PROXY=true` solo si el proxy inverso es confiable y controla `X-Forwarded-For`; de lo contrario déjelo desactivado.
4. Aplique rate limiting y WAF también en el proxy/API gateway. El limitador incorporado es intencionalmente por proceso; en despliegues con varias réplicas use Redis u otro almacén compartido.
5. Aplique acceso mínimo a MongoDB, copias de seguridad cifradas, cifrado en reposo y una política de retención para datos clínicos y pagos.
6. Configure Cloudinary con acceso privado/autenticado o un proxy de archivos firmado si las imágenes clínicas y firmas no deben ser accesibles por URL. `secure_url` significa TLS, no autorización por sí solo.
7. Centralice logs sin incluir tokens, contraseñas, historias clínicas completas ni URL de archivos sensibles. Añada auditoría de acciones críticas antes de requisitos regulatorios formales.
8. Mantenga Node.js y el lockfile actualizados, ejecute `npm audit` en CI y pruebe login, sockets, carga de imágenes, pagos e historias clínicas tras cada actualización.

## Límites conocidos y evolución recomendada

- La secuencia de boletas y los descuentos de inventario requieren transacciones/operaciones atómicas adicionales para despliegues de alta concurrencia.
- Los precios de pago todavía dependen de un catálogo que no contiene precio autoritativo en servidor; antes de facturación fiscal real debe existir un catálogo de precios versionado y el total debe calcularse exclusivamente en backend.
- Los cambios de perfil conservan internamente los nombres anteriores del profesional y actualizan sus tratamientos e historias clínicas por ID. Las lecturas y cambios de perfil solo reconcilian registros heredados mediante el propietario inmutable de una cita vinculada; un nombre editable o alias nunca concede propiedad. Los registros antiguos sin ID ni cita requieren una migración interna revisada: `professionalIdentity.service.reconciliarIdentidadesProfesionales({ dryRun: true, allowNameInference: true })` devuelve conteos sin escrituras, considerando coincidencias únicas del mismo rol y todas las cuentas, incluidas las suspendidas. La inferencia de extensiones/acortamientos exige al menos dos palabras completas; un caso más débil requiere una asignación explícita verificada mediante `approvedLegacyNames` junto con `allowNameInference: true`. Los registros ambiguos o con citas sin propietario válido permanecen sin asignar. Estas opciones son exclusivamente operativas y ningún controlador las acepta desde la API pública.
- La autenticación del frontend usa JWT en `localStorage` por compatibilidad. Una futura migración a cookies `HttpOnly` exige diseño CSRF y cambio coordinado de cliente/API.

## Scripts

| Comando | Resultado |
| --- | --- |
| `npm run dev` | Inicia Nodemon sobre `src/server.js`. |
| `npm start` | Inicia Node en modo normal. |
| `npm test` | Ejecuta pruebas con `node --test`. |
