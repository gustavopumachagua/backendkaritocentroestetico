# Backend Karito Centro Estetico - ERP para Centros de Estetica

Backend para una aplicacion ERP de gestion de centro estetico.
Desarrollado con Node.js, Express y MongoDB, maneja autenticacion, usuarios, citas, tratamientos, inventario, pagos, correos, carga de imagenes y eventos en tiempo real con Socket.IO.

---

## Caracteristicas principales

- Autenticacion con JWT.
- Gestion de usuarios, roles y estado de cuenta.
- Citas, tratamientos, inventario y pagos.
- Subida de imagenes a Cloudinary con optimizacion automatica.
- Galeria de tratamientos compatible con miniaturas optimizadas.
- Envio de correos de bienvenida y recuperacion de contrasena.
- Socket.IO para sincronizacion en tiempo real.
- Middlewares de seguridad para CORS, headers, entrada JSON y consultas Mongo.

---

## Cambios recientes

### Optimizacion de imagenes en Cloudinary

Las nuevas imagenes de tratamientos se guardan mas livianas para cuidar el almacenamiento de Cloudinary:

- Formato final `webp`.
- Limite de dimensiones: maximo `1600x1600` con `crop: limit`.
- Calidad automatica: `quality: auto:good`.
- Hasta 5 imagenes por tratamiento.
- Maximo 5 MB por imagen antes de subir.
- Validacion de tipos permitidos: JPG, PNG y WEBP.
- Miniatura derivada por Cloudinary: `480x360`, `quality: auto:eco`.
- Limpieza de archivos temporales locales aunque falle la subida.

Los avatares tambien se guardan en Cloudinary como WebP optimizado de `300x300`.

Archivos principales:

```text
src/controllers/tratamiento.controller.js
src/middlewares/upload.js
src/routes/upload.routes.js
src/models/Tratamiento.model.js
```

> Las imagenes antiguas ya subidas no se comprimen automaticamente. Para liberar espacio existente en Cloudinary hay que reprocesarlas o eliminarlas manualmente.

### Seguridad

Se agregaron defensas practicas para reducir riesgo ante ataques comunes:

- `helmet` para headers HTTP de seguridad.
- CORS con lista de origenes permitidos.
- Limite de payload JSON y formularios a 1 MB.
- Parser de query simple para evitar objetos complejos inesperados.
- Bloqueo de claves Mongo peligrosas en body/query, como `$ne`, `$gt` o claves con `.`.
- Escape de texto usado en busquedas con regex para evitar regex injection.
- Respuestas JSON controladas para errores de CORS y Multer.
- Validacion de usuario activo en cada JWT.
- Invalidacion de tokens antiguos cuando el usuario cambia su contrasena.

Archivos principales:

```text
src/middlewares/security.js
src/middlewares/authJwt.js
src/utils/escapeRegex.js
src/routes/cita.routes.js
src/routes/tratamiento.routes.js
```

### Recuperacion de contrasena

El enlace de recuperacion ahora usa un token firmado con expiracion de 30 minutos.
Ya no es posible cambiar una contrasena enviando solo el email.

Flujo:

1. `POST /api/auth/reset-password` genera un enlace con token.
2. El usuario abre `/new-password?token=...`.
3. `POST /api/auth/change-password` valida el token y guarda la nueva contrasena.
4. Los JWT emitidos antes del cambio quedan invalidados.

---

## Tecnologias utilizadas

| Tipo          | Tecnologia                | Descripcion                            |
| ------------- | ------------------------- | -------------------------------------- |
| Runtime       | Node.js                   | Entorno de ejecucion                   |
| Framework     | Express.js                | API REST                               |
| Base de datos | MongoDB + Mongoose        | Modelado y persistencia NoSQL          |
| Seguridad     | JWT, bcrypt, helmet, cors | Auth, hash y headers                   |
| Archivos      | Multer + Cloudinary       | Recepcion y almacenamiento de imagenes |
| Email         | Nodemailer / Brevo SDK    | Correos automaticos                    |
| Tiempo real   | Socket.IO                 | Eventos en vivo                        |
| Configuracion | dotenv                    | Variables de entorno                   |

---

## Arquitectura del proyecto

```text
Backend_Estetico/
├── src/
│   ├── config/            # DB y Cloudinary
│   ├── controllers/       # Logica de endpoints
│   ├── emails/            # Plantillas HTML de correo
│   ├── middlewares/       # Auth, upload y seguridad
│   ├── models/            # Modelos Mongoose
│   ├── routes/            # Rutas REST
│   ├── utils/             # Helpers y correo
│   ├── app.js             # Middlewares y rutas Express
│   └── server.js          # HTTP server y Socket.IO
├── package.json
└── README.md
```

---

## Variables de entorno

Crea un archivo `.env` en la raiz del backend:

```bash
PORT=5000
MONGO_URI=mongodb://localhost:27017/estetico_db
JWT_SECRET=clave_super_segura

FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
DEFAULT_AVATAR_URL=https://res.cloudinary.com/...

EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contrasena_app
```

Notas:

- `FRONTEND_URL` se usa para generar enlaces de recuperacion de contrasena.
- `CORS_ORIGINS` acepta varios origenes separados por coma.
- No subas `.env` al repositorio.

---

## Instalacion y ejecucion

```bash
npm install
npm run dev
```

Servidor local:

```text
http://localhost:5000
```

Produccion:

```bash
npm start
```

---

## Endpoints principales

| Metodo | Endpoint                           | Descripcion                       |
| ------ | ---------------------------------- | --------------------------------- |
| POST   | `/api/auth/login`                  | Inicio de sesion                  |
| POST   | `/api/auth/reset-password`         | Envia enlace de recuperacion      |
| POST   | `/api/auth/change-password`        | Cambia contrasena usando token    |
| GET    | `/api/usuarios`                    | Lista usuarios                    |
| POST   | `/api/usuarios/register`           | Crea usuario desde admin          |
| GET    | `/api/citas`                       | Lista citas                       |
| POST   | `/api/citas`                       | Crea cita                         |
| GET    | `/api/citas/buscar?nombre=`        | Busca pacientes por cita          |
| GET    | `/api/tratamientos`                | Lista tratamientos                |
| POST   | `/api/tratamientos`                | Registra tratamiento con imagenes |
| GET    | `/api/tratamientos/buscar/:nombre` | Busca datos de paciente           |
| GET    | `/api/inventario/:rol`             | Lista inventario por rol          |
| POST   | `/api/upload`                      | Sube avatar optimizado            |

---

## Reglas de subida de imagenes

### Tratamientos

- Campo multipart: `imagenes`.
- Maximo 5 archivos.
- Maximo 5 MB por archivo.
- Tipos permitidos: `image/jpeg`, `image/png`, `image/webp`.
- Cloudinary guarda una version optimizada y expone una miniatura en `thumbnailUrl`.

### Avatares

- Campo multipart: `file`.
- Maximo 2 MB.
- Tipos permitidos: JPG, PNG y WEBP.
- Se elimina el avatar anterior de Cloudinary cuando existe `avatarPublicId`.

---

## Buenas practicas implementadas

- Passwords hasheadas con bcrypt.
- JWT con expiracion y validacion de usuario activo.
- Reset de contrasena con token de uso limitado.
- CORS restringido por entorno.
- Validacion basica de archivos antes de subir a Cloudinary.
- Sanitizacion defensiva contra inyeccion NoSQL y regex injection.
- Limpieza de temporales en `uploads/`.

---

## Scripts disponibles

| Comando       | Descripcion                     |
| ------------- | ------------------------------- |
| `npm run dev` | Inicia el servidor con Nodemon  |
| `npm start`   | Inicia el servidor con Node     |
| `npm test`    | Placeholder actual del proyecto |

---

## Proximas mejoras

- Documentacion OpenAPI/Swagger.
- Rate limiting para login y reset de contrasena.
- Validacion de DTOs por endpoint con `express-validator`.
- Auditoria de acciones sensibles.
- Jobs para reprocesar imagenes antiguas en Cloudinary.
- Docker + CI/CD.

---

## Licencia

Proyecto bajo licencia MIT.
