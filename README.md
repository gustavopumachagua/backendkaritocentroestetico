# 🧖‍♀️ Backend Karito Centro Estético — ERP para Centros de Estética

Sistema **backend** para una aplicación **ERP (Enterprise Resource Planning)** diseñada para la **gestión completa de un centro estético**.
Desarrollado con **Node.js, Express y MongoDB**, implementando autenticación JWT, manejo de archivos, correo electrónico, y comunicación en tiempo real con **Socket.IO**.

---

## 🚀 Características principales

- 🔐 **Autenticación con JWT**
- 👩‍💼 **Gestión de usuarios (roles y permisos)**
- 📅 **Módulo de citas y tratamientos**
- 📦 **Módulo de inventario**
- 💬 **Comunicación en tiempo real (Socket.IO)**
- 📧 **Notificaciones por correo (Nodemailer)**
- ☁️ **Carga de imágenes con Cloudinary y Multer**
- 🧱 **Arquitectura limpia y escalable**

---

## 🧩 Tecnologías utilizadas

| Tipo               | Tecnología                    | Descripción                             |
| ------------------ | ----------------------------- | --------------------------------------- |
| Runtime            | **Node.js 22+**               | Entorno de ejecución del backend        |
| Framework          | **Express.js**                | Framework web minimalista y rápido      |
| Base de datos      | **MongoDB + Mongoose**        | ORM para modelado de datos NoSQL        |
| Seguridad          | **JWT, bcrypt, helmet, cors** | Autenticación y protección de API       |
| Subida de archivos | **Multer + Cloudinary**       | Gestión de imágenes en la nube          |
| Email              | **Nodemailer**                | Envío de correos automáticos            |
| Tiempo real        | **Socket.IO**                 | Comunicación bidireccional (WebSockets) |
| Logs               | **Morgan**                    | Registro de peticiones HTTP             |
| Validación         | **express-validator**         | Validación y sanitización de datos      |
| Configuración      | **dotenv**                    | Variables de entorno seguras            |

---

## 🧱 Arquitectura del proyecto

```
backend_estetico/
│
├── src/
│   ├── config/            # Configuración general (DB, Cloudinary, etc.)
│   ├── controllers/       # Controladores que manejan la lógica de rutas
│   ├── models/            # Modelos Mongoose
│   ├── routes/            # Definición de endpoints REST
│   ├── middleware/        # Middlewares de validación, auth, errores, etc.
│   ├── services/          # Lógica de negocio (inventario, citas, usuarios)
│   ├── utils/             # Funciones auxiliares (tokens, emails, formateo)
│   ├── sockets/           # Configuración y eventos de Socket.IO
│   ├── server.js          # Servidor principal Express
│   └── app.js             # Inicialización de middlewares y rutas
│
├── .env                   # Variables de entorno (no se sube a GitHub)
├── package.json
├── README.md
└── nodemon.json
```

---

## 🔐 Variables de entorno (.env)

```bash
PORT=5000
MONGO_URI=mongodb://localhost:27017/estetico_db
JWT_SECRET=clave_super_segura
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_app
CLIENT_URL=http://localhost:5173
```

> ⚠️ Nunca subas tu archivo `.env` al repositorio.

---

## ⚙️ Instalación y ejecución

```bash
git clone https://github.com/tuusuario/backend_estetico.git
cd backend_estetico
npm install
npm run dev
```

Servidor corriendo en 👉 `http://localhost:5000`

---

## 📡 Endpoints principales

| Método | Endpoint              | Descripción          |
| ------ | --------------------- | -------------------- |
| POST   | `/api/auth/login`     | Inicio de sesión     |
| POST   | `/api/auth/register`  | Registro de usuarios |
| GET    | `/api/usuarios`       | Listado de usuarios  |
| GET    | `/api/citas`          | Listar citas         |
| POST   | `/api/citas`          | Crear cita           |
| PUT    | `/api/inventario/:id` | Actualizar insumo    |
| DELETE | `/api/inventario/:id` | Eliminar insumo      |

---

## 🧠 Buenas prácticas

- Código modular y legible
- Manejo centralizado de errores
- Validación de datos de entrada
- Control de acceso basado en roles
- Variables sensibles en `.env`

---

## 📈 Próximas mejoras

- Documentación de API con Swagger
- Sistema de notificaciones internas
- Implementación de colas (BullMQ / Redis)
- Dashboard de métricas
- Despliegue con Docker + CI/CD

---

## 🧑‍💻 Autor

**Gustavo Rubén Pumachagua Pérez**

📍 Lima, Perú

💼 Fullstack Developer | MERN Stack | Data Analysis

---

## 📜 Licencia

Proyecto bajo licencia **MIT**.
