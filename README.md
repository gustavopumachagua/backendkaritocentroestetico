# Backend Karito Centro Estético

## Sistema Web de Gestión Administrativa para Citas, Servicios, Facturación e Inventarios

Backend del sistema ERP para el Centro Estético Karito, desarrollado con la arquitectura **Cliente-Servidor** y el stack **MERN** (MongoDB, Express, React, Node.js).

> **Proyecto de tesis:** *"Diseño e Implementación de un Sistema Web de Gestión Administrativa para Citas, Servicios, Facturación e Inventarios en el Centro Estético Karito, utilizando la Arquitectura Cliente-Servidor con las Tecnologías MERN."*

---

## Tabla de Contenidos

- [Características Principales](#características-principales)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Arquitectura del Proyecto](#arquitectura-del-proyecto)
  - [Arquitectura en Capas](#arquitectura-en-capas)
  - [Flujo de una Petición HTTP](#flujo-de-una-petición-http)
  - [Estructura de Directorios](#estructura-de-directorios)
- [Principios de Código Limpio](#principios-de-código-limpio)
  - [SOLID](#solid)
  - [DRY — Don't Repeat Yourself](#dry--dont-repeat-yourself)
  - [KISS — Keep It Simple, Stupid](#kiss--keep-it-simple-stupid)
  - [Separation of Concerns](#separation-of-concerns)
- [Patrones de Diseño](#patrones-de-diseño)
  - [Repository Pattern](#repository-pattern)
  - [Service Pattern](#service-pattern)
  - [Middleware Pattern](#middleware-pattern)
  - [Factory Pattern](#factory-pattern)
- [Módulos del Sistema](#módulos-del-sistema)
- [Endpoints de la API](#endpoints-de-la-api)
- [Seguridad](#seguridad)
- [Gestión de Imágenes](#gestión-de-imágenes)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Ejecución](#instalación-y-ejecución)
- [Scripts Disponibles](#scripts-disponibles)
- [Licencia](#licencia)

---

## Características Principales

- **Autenticación y autorización** con JWT y control de roles (administrador, doctor, cosmiatra).
- **Gestión de usuarios** con creación por administrador, suspensión y eliminación.
- **Gestión de citas** con estados (pendiente, atendido, aplazado, cancelado) y profesional asignado.
- **Registro de tratamientos** con galería de imágenes optimizadas en Cloudinary.
- **Inventario** de insumos y servicios por rol, con control de stock y umbrales.
- **Facturación** con generación automática de número de boleta.
- **Correos automáticos** de bienvenida y recuperación de contraseña vía Brevo.
- **Tiempo real** con Socket.IO para sincronización instantánea entre clientes.
- **Seguridad multicapa** con helmet, CORS, sanitización NoSQL y validación de entrada.

---

## Tecnologías Utilizadas

| Categoría     | Tecnología              | Función                                         |
|---------------|-------------------------|-------------------------------------------------|
| Runtime       | Node.js                 | Entorno de ejecución del servidor               |
| Framework     | Express.js              | Framework para la API REST                      |
| Base de datos | MongoDB + Mongoose      | Base de datos NoSQL con modelado de esquemas     |
| Autenticación | JWT + bcryptjs          | Tokens de sesión y hashing de contraseñas        |
| Seguridad     | helmet + cors           | Headers HTTP seguros y control de orígenes       |
| Validación    | express-validator       | Validación de datos de entrada                   |
| Archivos      | Multer + Cloudinary     | Recepción y almacenamiento optimizado de imágenes|
| Email         | Brevo SDK               | Envío de correos transaccionales                 |
| Tiempo real   | Socket.IO               | Eventos bidireccionales en tiempo real            |
| Configuración | dotenv                  | Gestión de variables de entorno                  |
| Desarrollo    | nodemon                 | Recarga automática en desarrollo                 |

---

## Arquitectura del Proyecto

### Arquitectura en Capas

El backend implementa una **arquitectura en capas** que separa las responsabilidades en 4 niveles claramente diferenciados:

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTE (React)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP Request
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1: ROUTES                                             │
│  Responsabilidad: Declaración de endpoints y middlewares     │
│  Archivos: src/routes/*.routes.js                           │
│  No contiene lógica de negocio                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 2: CONTROLLERS                                        │
│  Responsabilidad: Orquestación HTTP                         │
│  - Extrae datos del request (params, body, query)           │
│  - Delega al Service correspondiente                        │
│  - Formatea la respuesta HTTP                               │
│  - Emite eventos Socket.IO cuando corresponde               │
│  Archivos: src/controllers/*.controller.js                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 3: SERVICES                                           │
│  Responsabilidad: Lógica de negocio                         │
│  - Validaciones de dominio                                  │
│  - Reglas de negocio                                        │
│  - Orquestación de operaciones entre repositorios           │
│  - Lanza AppError con código HTTP semántico                 │
│  Archivos: src/services/*.service.js                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CAPA 4: REPOSITORIES                                       │
│  Responsabilidad: Acceso a datos                            │
│  - Encapsula todas las operaciones de Mongoose              │
│  - Queries, creates, updates, deletes                       │
│  - Ninguna otra capa interactúa directamente con Mongoose   │
│  Archivos: src/repositories/*.repository.js                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  MODELS (Mongoose Schemas)                                  │
│  Archivos: src/models/*.model.js                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      MongoDB                                │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de una Petición HTTP

Ejemplo: **Crear una cita** (`POST /api/citas`)

```
1. Request llega a cita.routes.js
   └─ Middleware authJwt verifica el token JWT

2. El router invoca crearCita en cita.controller.js
   └─ Extrae { cliente, rol, profesional, servicio, fecha } de req.body
   └─ Llama a citaService.crearCita(...)

3. cita.service.js ejecuta la lógica de negocio:
   ├─ Valida campos requeridos
   ├─ Resuelve el profesional (por ID o nombre) vía userRepository
   ├─ Valida servicios por rol vía servicioRepository
   ├─ Valida la fecha
   └─ Crea la cita vía citaRepository.create(...)

4. cita.repository.js ejecuta las operaciones Mongoose:
   └─ new Cita(data).save()

5. El controller recibe el resultado:
   ├─ Emite evento Socket.IO "nuevaCita"
   └─ Responde res.status(201).json({ message, cita })
```

### Estructura de Directorios

```
Backend_Estetico/
├── src/
│   ├── app.js                          # Configuración de Express y middlewares
│   ├── server.js                       # Bootstrap: HTTP server + Socket.IO
│   │
│   ├── config/                         # Configuración externa
│   │   ├── db.js                       #   Conexión a MongoDB
│   │   └── cloudinary.js               #   Configuración de Cloudinary
│   │
│   ├── constants/                      # Constantes del sistema
│   │   └── index.js                    #   Valores centralizados (tokens, estados, etc.)
│   │
│   ├── errors/                         # Manejo de errores personalizado
│   │   └── AppError.js                 #   Clase de error con statusCode
│   │
│   ├── helpers/                        # Funciones auxiliares reutilizables
│   │   ├── asyncHandler.js             #   Wrapper async para controllers
│   │   ├── emailTemplateRenderer.js    #   Renderizado de plantillas de correo
│   │   └── fileHelper.js              #   Eliminación segura de archivos temporales
│   │
│   ├── middlewares/                    # Middlewares de Express
│   │   ├── authJwt.js                  #   Autenticación JWT
│   │   ├── authorizeRole.js            #   Autorización por rol (factory)
│   │   ├── security.js                 #   CORS, helmet, sanitización, errorHandler
│   │   └── upload.js                   #   Configuración de Multer para imágenes
│   │
│   ├── models/                         # Esquemas de Mongoose
│   │   ├── User.model.js               #   Usuario (con hash de contraseña)
│   │   ├── Cita.model.js               #   Cita médica
│   │   ├── Tratamiento.model.js        #   Tratamiento con galería de imágenes
│   │   ├── Inventario.model.js         #   Insumos y servicios por rol
│   │   ├── Pago.model.js               #   Facturación con boleta
│   │   └── Servicio.model.js           #   Catálogo de servicios
│   │
│   ├── repositories/                   # Capa de acceso a datos
│   │   ├── user.repository.js          #   Operaciones Mongoose para Usuario
│   │   ├── cita.repository.js          #   Operaciones Mongoose para Cita
│   │   ├── tratamiento.repository.js   #   Operaciones Mongoose para Tratamiento
│   │   ├── inventario.repository.js    #   Operaciones Mongoose para Inventario
│   │   ├── pago.repository.js          #   Operaciones Mongoose para Pago
│   │   └── servicio.repository.js      #   Operaciones Mongoose para Servicio
│   │
│   ├── services/                       # Capa de lógica de negocio
│   │   ├── auth.service.js             #   Login, reset y cambio de contraseña
│   │   ├── cita.service.js             #   CRUD de citas y búsqueda de pacientes
│   │   ├── tratamiento.service.js      #   Registro con Cloudinary y búsqueda
│   │   ├── inventario.service.js       #   Gestión de stock e insumos
│   │   ├── pago.service.js             #   Registro de pagos y boletas
│   │   └── user.service.js             #   Gestión de usuarios y profesionales
│   │
│   ├── controllers/                    # Orquestadores HTTP (thin controllers)
│   │   ├── auth.controller.js          #   Endpoints de autenticación
│   │   ├── cita.controller.js          #   Endpoints de citas
│   │   ├── tratamiento.controller.js   #   Endpoints de tratamientos
│   │   ├── inventario.controller.js    #   Endpoints de inventario
│   │   ├── pago.controller.js          #   Endpoints de pagos
│   │   └── user.controller.js          #   Endpoints de usuarios
│   │
│   ├── routes/                         # Definición de rutas REST
│   │   ├── auth.routes.js              #   /api/auth/*
│   │   ├── cita.routes.js              #   /api/citas/*
│   │   ├── tratamiento.routes.js       #   /api/tratamientos/*
│   │   ├── inventario.routes.js        #   /api/inventario/*
│   │   ├── pago.routes.js              #   /api/pagos/*
│   │   ├── user.routes.js              #   /api/usuarios/*
│   │   └── upload.routes.js            #   /api/upload/*
│   │
│   ├── emails/                         # Plantillas HTML de correo
│   │   ├── adminWelcomeEmail.html      #   Bienvenida para administrador
│   │   ├── usuariosWelcomeEmail.html   #   Bienvenida para usuarios
│   │   └── resetPassword.html          #   Recuperación de contraseña
│   │
│   └── utils/                          # Utilidades del sistema
│       ├── createAdmin.js              #   Seed del administrador inicial
│       ├── sendEmail.js                #   Envío de correo via Brevo API
│       └── escapeRegex.js              #   Sanitización de expresiones regulares
│
├── uploads/                            # Directorio temporal para archivos subidos
├── .env                                # Variables de entorno (no versionado)
├── .gitignore
├── package.json
└── README.md
```

---

## Principios de Código Limpio

### SOLID

#### S — Single Responsibility Principle (Responsabilidad Única)

Cada módulo tiene **una sola razón para cambiar**:

| Capa | Responsabilidad única |
|------|----------------------|
| **Routes** | Declarar qué endpoint usa qué middleware y qué controller |
| **Controllers** | Extraer datos del HTTP request, llamar al service, formatear la respuesta |
| **Services** | Ejecutar la lógica de negocio y reglas del dominio |
| **Repositories** | Ejecutar operaciones de lectura/escritura contra MongoDB |

**Ejemplo concreto:**

```javascript
// ❌ ANTES: El controller hacía todo (HTTP + lógica + acceso a datos)
const crearCita = async (req, res) => {
  try {
    const { cliente, rol, profesional } = req.body;
    // ...validaciones de negocio...
    const profesionalDoc = await User.findById(profesional);  // acceso directo a Mongoose
    // ...más lógica...
    const nuevaCita = new Cita({ ... });
    await nuevaCita.save();
    io.emit("nuevaCita", citaPop);
    res.status(201).json({ ... });
  } catch (error) {
    res.status(500).json({ message: "Error" });
  }
};

// ✅ DESPUÉS: El controller solo orquesta
const crearCita = asyncHandler(async (req, res) => {
  const { cliente, rol, profesional, servicio, fecha } = req.body;
  const citaPop = await citaService.crearCita({ cliente, rol, profesional, servicio, fecha });
  req.app.get("io").emit("nuevaCita", citaPop);
  res.status(201).json({ message: "Cita creada", cita: citaPop });
});
```

#### O — Open/Closed Principle (Abierto/Cerrado)

Los módulos están **abiertos a extensión** y **cerrados a modificación**:

- `AppError`: se pueden crear nuevos tipos de error sin modificar el `errorHandler`.
- `authorizeRole(...roles)`: se pueden agregar nuevos roles sin modificar controllers.

```javascript
// Agregar un nuevo rol es solo cambiar la llamada en la ruta:
router.post("/register", authMiddleware, authorizeRole("administrador"), crearUsuario);
// Si mañana se agrega "recepcionista":
router.post("/register", authMiddleware, authorizeRole("administrador", "recepcionista"), crearUsuario);
// Sin modificar el middleware ni el controller.
```

#### D — Dependency Inversion Principle (Inversión de Dependencias)

Las capas superiores dependen de **abstracciones** (métodos del repositorio), no de **implementaciones concretas** (Mongoose):

```javascript
// ✅ El service llama al repositorio (abstracción)
const user = await userRepository.findByEmail(email);

// ❌ NO llama directamente a Mongoose (implementación)
const user = await User.findOne({ email });
```

Si en el futuro se migrara de MongoDB a PostgreSQL, solo cambiarían los repositorios.

---

### DRY — Don't Repeat Yourself

Se eliminaron todas las duplicaciones detectadas:

| Código duplicado | Antes | Después |
|-----------------|-------|---------|
| `renderEmailTemplate()` | Duplicada en 3 archivos | Centralizada en `helpers/emailTemplateRenderer.js` |
| `deleteLocalFile()` | Duplicada en 2 archivos | Centralizada en `helpers/fileHelper.js` |
| `try/catch + res.status(500)` | Repetido en ~30 handlers | Centralizado en `helpers/asyncHandler.js` |
| `req.user.rol !== "administrador"` | Repetido en 4 métodos | Centralizado en `middlewares/authorizeRole.js` |
| Resolución de profesional por ID/nombre | Duplicada en crear y actualizar cita | Extraída como `resolverProfesional()` en `cita.service.js` |

---

### KISS — Keep It Simple, Stupid

- **Constantes centralizadas** en `constants/index.js` en lugar de magic strings dispersos:

  ```javascript
  // ❌ ANTES: string "mágico" disperso
  const estadosValidos = ["atendido", "aplazado", "cancelado"];

  // ✅ DESPUÉS: constante importada
  const { ESTADOS_CITA_VALIDOS } = require("../constants");
  ```

- **Helpers simples y enfocados**: cada helper hace una sola cosa (`asyncHandler`, `escapeRegex`, `deleteLocalFile`).

---

### Separation of Concerns

Cada capa maneja un **único aspecto** del sistema:

```
HTTP (req/res)          → Controllers
Lógica de negocio       → Services
Acceso a datos          → Repositories
Esquema de datos        → Models
Seguridad transversal   → Middlewares
Configuración externa   → Config
```

**Ejemplo en rutas:** Antes, los archivos de rutas contenían lógica de negocio inline. Ahora solo declaran endpoints:

```javascript
// ❌ ANTES: Lógica de negocio directamente en el archivo de rutas
router.get("/buscar", authMiddleware, async (req, res) => {
  const citas = await Cita.find({ cliente: { $regex: ... } });
  const nombresUnicos = [...new Set(citas.map(c => c.cliente))];
  res.json(nombresUnicos);
});

// ✅ DESPUÉS: La ruta solo declara el endpoint
router.get("/buscar", authMiddleware, buscarPacientes);
```

---

## Patrones de Diseño

### Repository Pattern

**Problema:** Los controllers accedían directamente a los modelos de Mongoose (`User.findOne()`, `Cita.find()`, etc.), acoplando la lógica de negocio al ORM.

**Solución:** Se creó una capa de repositorios que encapsula todas las operaciones de base de datos.

```
src/repositories/
├── user.repository.js          # findByEmail, findById, findAll, create, ...
├── cita.repository.js          # findAll, findById, create, searchByClientName, ...
├── inventario.repository.js    # findByRol, findByRolTipoNombre, create, ...
├── pago.repository.js          # findAll, findByCita, findLastByBoleta, create
├── servicio.repository.js      # findByRolAndNombres
└── tratamiento.repository.js   # findAll, create, findByNombreExact
```

**Beneficio:** Si se cambiara el ORM o la base de datos, solo cambiarían los repositorios. Los services y controllers no se verían afectados.

---

### Service Pattern

**Problema:** Los controllers contenían validaciones, reglas de negocio, cálculos y orquestación de múltiples operaciones de base de datos.

**Solución:** Se creó una capa de servicios que contiene toda la lógica de negocio. Los services reciben datos primitivos (no `req`/`res`) y retornan datos o lanzan `AppError`.

```
src/services/
├── auth.service.js             # login, resetPassword, changePassword
├── cita.service.js             # crearCita, actualizarCita, buscarPacientes, ...
├── inventario.service.js       # agregarItem, descontarInsumos, ...
├── pago.service.js             # registrarPago, obtenerPagos, ...
├── tratamiento.service.js      # crearTratamiento, buscarPaciente, ...
└── user.service.js             # crearUsuario, suspenderUsuario, ...
```

**Beneficio:** La lógica de negocio es testeable de forma aislada (sin necesitar Express ni HTTP) y reutilizable desde cualquier interfaz (REST, GraphQL, CLI, etc.).

---

### Middleware Pattern

Express middlewares se usan para **concerns transversales** que aplican a múltiples rutas:

| Middleware | Responsabilidad |
|-----------|-----------------|
| `authJwt` | Verificar token JWT, validar usuario activo, verificar vigencia del token |
| `authorizeRole` | Verificar que el usuario tiene el rol requerido |
| `security.js` | Headers de seguridad (helmet), CORS, sanitización NoSQL, error handler |
| `upload.js` | Configuración de Multer para recepción de imágenes |
| `asyncHandler` | Propagación automática de errores async al error handler |

---

### Factory Pattern

El middleware `authorizeRole` implementa el patrón **Factory** para generar middlewares dinámicamente según los roles requeridos:

```javascript
// authorizeRole es una factory que retorna un middleware configurado
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    next();
  };
};

// Uso: genera un middleware que solo permite "administrador"
router.post("/register", authMiddleware, authorizeRole("administrador"), crearUsuario);
```

---

## Manejo Centralizado de Errores

El sistema implementa un flujo de errores limpio a través de todas las capas:

```
Service/Repository  →  lanza AppError(message, statusCode)
       │
       ▼
asyncHandler        →  captura el error y llama next(error)
       │
       ▼
errorHandler        →  detecta AppError por isOperational
       │                y responde con el statusCode correcto
       ▼
Cliente             →  recibe { message: "..." } con el código HTTP adecuado
```

```javascript
// En el Service:
if (!user) {
  throw new AppError("Usuario no encontrado", 404);
}

// El errorHandler en security.js lo traduce automáticamente a:
// HTTP 404 → { "message": "Usuario no encontrado" }
```

---

## Módulos del Sistema

| Módulo | Descripción | Archivos clave |
|--------|-------------|----------------|
| **Autenticación** | Login con JWT, reset y cambio de contraseña | `auth.service.js`, `authJwt.js` |
| **Usuarios** | CRUD de usuarios, roles, suspensión | `user.service.js`, `authorizeRole.js` |
| **Citas** | Agenda de citas con profesional y servicios | `cita.service.js`, `cita.repository.js` |
| **Tratamientos** | Registro con galería de imágenes | `tratamiento.service.js`, `cloudinary.js` |
| **Inventario** | Control de insumos y servicios por rol | `inventario.service.js` |
| **Pagos** | Facturación con boleta automática | `pago.service.js` |
| **Correo** | Emails transaccionales vía Brevo | `sendEmail.js`, `emailTemplateRenderer.js` |
| **Tiempo Real** | Sincronización con Socket.IO | `server.js`, controllers |

---

## Endpoints de la API

### Autenticación (`/api/auth`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Inicio de sesión | No |
| POST | `/api/auth/reset-password` | Envía enlace de recuperación | No |
| POST | `/api/auth/change-password` | Cambia contraseña con token | No |

### Usuarios (`/api/usuarios`)

| Método | Endpoint | Descripción | Auth | Rol |
|--------|----------|-------------|------|-----|
| GET | `/api/usuarios` | Lista todos los usuarios | Sí | Admin |
| POST | `/api/usuarios/register` | Crea usuario nuevo | Sí | Admin |
| GET | `/api/usuarios/profesionales` | Lista profesionales activos | Sí | Cualquiera |
| PUT | `/api/usuarios/:id` | Actualiza perfil | Sí | Cualquiera |
| PATCH | `/api/usuarios/:id/suspender` | Suspende/activa usuario | Sí | Admin |
| DELETE | `/api/usuarios/:id` | Elimina usuario | Sí | Admin |

### Citas (`/api/citas`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/citas` | Lista todas las citas | Sí |
| POST | `/api/citas` | Crea nueva cita | Sí |
| GET | `/api/citas/buscar?nombre=` | Busca pacientes por nombre | Sí |
| PUT | `/api/citas/:id` | Actualiza cita | Sí |
| DELETE | `/api/citas/:id` | Elimina cita | Sí |
| PATCH/PUT | `/api/citas/:id/estado` | Actualiza estado de cita | Sí |

### Tratamientos (`/api/tratamientos`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/tratamientos` | Lista tratamientos | Sí |
| POST | `/api/tratamientos` | Registra tratamiento (multipart) | Sí |
| GET | `/api/tratamientos/buscar/:nombre` | Busca datos de paciente | Sí |

### Inventario (`/api/inventario`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/inventario/:rol` | Lista inventario por rol | No |
| POST | `/api/inventario` | Agrega/actualiza item | No |
| PUT | `/api/inventario/descontar` | Descuenta insumos | No |
| PUT | `/api/inventario/:id` | Actualiza item | No |
| DELETE | `/api/inventario/:id` | Elimina item | No |

### Pagos (`/api/pagos`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/pagos` | Lista todos los pagos | Sí |
| POST | `/api/pagos` | Registra nuevo pago | Sí |
| GET | `/api/pagos/:citaId` | Obtiene pagos de una cita | Sí |

### Upload (`/api/upload`)

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/api/upload` | Sube avatar de usuario | Sí |

---

## Seguridad

### Medidas Implementadas

| Capa | Medida | Descripción |
|------|--------|-------------|
| **HTTP** | `helmet` | Headers de seguridad (X-Content-Type-Options, X-Frame-Options, etc.) |
| **CORS** | Lista blanca | Solo orígenes configurados en `FRONTEND_URL` y `CORS_ORIGINS` |
| **Payload** | Límite 1 MB | Body JSON y URL-encoded limitados a 1 MB |
| **Query** | Parser simple | `query parser: simple` evita objetos complejos en query strings |
| **NoSQL** | Sanitización | Bloqueo de claves peligrosas (`$ne`, `$gt`, claves con `.`) |
| **Regex** | Escape | `escapeRegex()` previene inyección de expresiones regulares |
| **Auth** | JWT + bcrypt | Tokens con expiración y contraseñas hasheadas con salt |
| **Sesión** | Invalidación | Tokens emitidos antes de un cambio de contraseña quedan invalidados |
| **Roles** | `authorizeRole` | Middleware que verifica permisos por rol |
| **Errores** | Error handler | Respuestas controladas sin exposición de stack traces |

### Flujo de Recuperación de Contraseña

```
1. POST /api/auth/reset-password  →  Genera token firmado (30 min de validez)
2. Email con enlace: /new-password?token=...
3. POST /api/auth/change-password  →  Valida token, cambia contraseña
4. Todos los JWT anteriores quedan invalidados automáticamente
```

---

## Gestión de Imágenes

### Tratamientos

| Configuración | Valor |
|--------------|-------|
| Campo multipart | `imagenes` |
| Máximo archivos | 5 |
| Tamaño máximo | 5 MB por imagen |
| Tipos permitidos | JPEG, PNG, WEBP |
| Formato final | WebP |
| Dimensiones máximas | 1600×1600 (`crop: limit`) |
| Calidad | `auto:good` |
| Miniatura | 480×360 (`crop: fill`, `quality: auto:eco`) |

### Avatares

| Configuración | Valor |
|--------------|-------|
| Campo multipart | `file` |
| Tamaño máximo | 2 MB |
| Tipos permitidos | JPEG, PNG, WEBP |
| Formato final | WebP |
| Dimensiones | 300×300 (`crop: fill`) |
| Avatar anterior | Se elimina de Cloudinary al subir uno nuevo |

---

## Variables de Entorno

Crear un archivo `.env` en la raíz del proyecto:

```bash
# Servidor
PORT=5000
NODE_ENV=development

# Base de datos
MONGO_URI=mongodb://localhost:27017/centro_estetico

# Autenticación
JWT_SECRET=tu_clave_secreta_segura

# Frontend
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# Cloudinary
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

# Email (Brevo)
BREVO_API_KEY=tu_brevo_api_key
MAIL_FROM="Centro Estético <tu_correo@gmail.com>"

# Administrador inicial
ADMIN_EMAIL=admin@ejemplo.com
ADMIN_PASSWORD=contrasena_segura
DEFAULT_AVATAR_URL=https://res.cloudinary.com/...
```

> **Nota:** No versionar el archivo `.env` en el repositorio. Asegurar que esté incluido en `.gitignore`.

---

## Instalación y Ejecución

### Requisitos Previos

- Node.js (v18 o superior)
- MongoDB (local o Atlas)
- Cuenta en Cloudinary
- Cuenta en Brevo (para envío de correos)

### Instalación

```bash
# Clonar el repositorio
git clone <url-del-repositorio>
cd Backend_Estetico

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

### Ejecución

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start
```

El servidor se ejecutará en `http://localhost:5000`.

Al iniciar, el sistema automáticamente:
1. Conecta a MongoDB.
2. Verifica/crea el usuario administrador inicial.
3. Inicia el servidor HTTP con Socket.IO.

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor con Nodemon (desarrollo) |
| `npm start` | Inicia el servidor con Node (producción) |
| `npm test` | Placeholder para pruebas futuras |

---

## Licencia

Proyecto bajo licencia MIT.
