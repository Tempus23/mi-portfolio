# 🤖 Chat AI para Portfolio

Este chat AI interactivo permite a reclutadores e interesados obtener información sobre tu experiencia profesional, habilidades, proyectos y formación académica de manera conversacional.

## 🌟 Características

- **Información contextual**: El chat tiene acceso completo a tu CV (experiencia, proyectos, habilidades)
- **Multiidioma**: Responde automáticamente en español o inglés según el idioma de la pregunta
- **Conversación natural**: Mantiene el contexto de la conversación (últimos 10 mensajes)
- **Diseño moderno**: UI atractiva con modo claro/oscuro y animaciones suaves
- **Responsive**: Funciona perfectamente en móviles, tablets y escritorio
- **Powered by Google Gemini**: Utiliza el modelo Gemini Pro de Google, rápido y con generoso nivel gratuito

## 📋 Configuración

### 1. Obtén tu API Key de Google Gemini

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Inicia sesión con tu cuenta de Google
3. Crea una nueva API key
4. Copia la clave generada

**Nota**: Gemini tiene un generoso nivel gratuito que incluye:
- 60 requests por minuto
- 1,500 requests por día
- 1 millón de tokens por minuto

### 2. Configura las variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

Edita el archivo `.env` y añade tu API key:

```env
GEMINI_API_KEY=tu-clave-aqui
```

**⚠️ IMPORTANTE**: Nunca subas tu archivo `.env` a Git. Ya está incluido en `.gitignore`.

### 3. Configura la variable de entorno en Cloudflare Pages

1. Ve a tu proyecto en Cloudflare Pages Dashboard
2. Ve a **Settings** > **Environment variables**
3. Añade una nueva variable:
   - **Variable name**: `GEMINI_API_KEY`
   - **Value**: Tu API key de Gemini
   - **Environment**: Production (y Preview si quieres)
4. Guarda los cambios

### 4. Ejecuta el proyecto localmente (opcional)

```bash
npm run dev
```

**Nota**: En local, el chat usará las variables de entorno del archivo `.env`. En producción en Cloudflare Pages, usará las variables configuradas en el dashboard.

El chat aparecerá como un botón flotante en la esquina inferior derecha de tu portfolio.

## 🎨 Personalización

### Modificar el contexto del chat

El contexto que el chat usa está en `/src/pages/api/chat.ts`. La función `getCvContextPrompt()` genera el prompt del sistema basándose en tus datos del CV.

Para modificar cómo responde el chat, edita las instrucciones al final de esta función.

### Cambiar el modelo de Gemini

Por defecto usa `gemini-pro`. Para explorar otros modelos:

```typescript
// En /src/pages/api/chat.ts
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
```

Modelos disponibles:
- `gemini-pro` - Modelo principal para texto (recomendado)
- `gemini-pro-vision` - Para análisis de imágenes y texto

### Ajustar parámetros de generación

Puedes modificar la temperatura y tokens máximos:

```typescript
generationConfig: {
  temperature: 0.7,  // 0.0 = más preciso, 1.0 = más creativo
  maxOutputTokens: 500,  // Longitud máxima de respuesta
}
```

### Modificar el diseño del chat

El componente del chat está en `/src/components/ui/ChatBot.astro`. Puedes modificar:
- Colores (clases de Tailwind CSS)
- Tamaño de la ventana
- Posición del botón
- Estilos de los mensajes

## 💬 Ejemplos de preguntas que puede responder

- "¿Cuál es tu experiencia en IA?"
- "Tell me about your projects"
- "¿Qué tecnologías dominas?"
- "What's your educational background?"
- "¿Tienes experiencia con Python?"
- "How can I contact you?"
- "¿Cuál fue tu rol en Mercadona IT?"
- "Tell me about your Machine Learning experience"

## 🔒 Seguridad y Privacidad

- La API key se mantiene segura en el servidor (variables de entorno)
- No se expone al cliente
- Las conversaciones no se guardan (solo en memoria durante la sesión)
- Google puede usar las conversaciones para mejorar sus modelos según su política de privacidad

## 💰 Costos

Google Gemini ofrece un **nivel gratuito muy generoso**:

**Nivel Gratuito:**
- 60 requests por minuto
- 1,500 requests por día
- 1 millón de tokens por minuto
- **Completamente gratis** para uso personal y de desarrollo

**Nivel de pago (si excedes el gratuito):**
- Muy económico comparado con otras APIs
- Ver precios actualizados en [Google AI Pricing](https://ai.google.dev/pricing)

Para un portfolio personal, el nivel gratuito es más que suficiente.

## ☁️ Despliegue en Cloudflare Pages

Este chat está optimizado para funcionar en **Cloudflare Pages**. La estructura de archivos utiliza Cloudflare Pages Functions:

```
functions/
  api/
    chat.ts  ← Función serverless para el chat
```

### Configuración en Cloudflare

1. **Conecta tu repositorio** a Cloudflare Pages
2. **Configura el build**:
   - Build command: `npm run build`
   - Build output directory: `dist`
3. **Añade la variable de entorno** `GEMINI_API_KEY` en Settings > Environment variables
4. **Despliega** y el chat funcionará automáticamente

### Características específicas de Cloudflare

- ✅ **Sin dependencias externas**: Usa la API REST de Gemini directamente
- ✅ **Rápido**: Las funciones se ejecutan en el edge de Cloudflare
- ✅ **Sin límite de tiempo estricto**: Las funciones tienen timeout suficiente
- ✅ **CORS configurado**: Funcionará correctamente desde tu dominio

## 🐛 Solución de problemas

### El chat no responde

1. Verifica que la API key esté correctamente configurada en `.env`
2. Comprueba la consola del navegador para errores
3. Asegúrate de no haber excedido los límites del nivel gratuito
4. Verifica que la API key sea válida en [Google AI Studio](https://aistudio.google.com/app/apikey)

### Error: "GEMINI_API_KEY is not set"

- Asegúrate de haber creado el archivo `.env` con tu API key
- Reinicia el servidor de desarrollo después de crear/modificar `.env`
- Verifica que el nombre de la variable sea exactamente `GEMINI_API_KEY`

### El chat responde en el idioma incorrecto

- El chat detecta el idioma automáticamente basándose en tu pregunta
- Si persiste el problema, verifica la función `getCvContextPrompt()` en `/src/pages/api/chat.ts`

### Error 429: Too Many Requests

- Has excedido el límite de requests por minuto (60 RPM en el nivel gratuito)
- Espera un minuto antes de enviar más mensajes
- Considera implementar rate limiting en el frontend si es necesario

## 📚 Recursos

- [Google AI for Developers](https://ai.google.dev/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Google AI Studio](https://aistudio.google.com/)
- [Astro Documentation](https://docs.astro.build)

## 🚀 Ventajas de usar Gemini vs OpenAI

✅ **Nivel gratuito generoso** - Suficiente para portfolios personales
✅ **Respuestas rápidas** - Latencia baja
✅ **Multiidioma nativo** - Excelente soporte para español e inglés
✅ **Sin tarjeta de crédito** - No necesitas tarjeta para el nivel gratuito
✅ **Fácil de usar** - API simple y directa

## 🎯 Próximas mejoras

Ideas para mejorar el chat:

- [ ] Agregar persistencia de conversaciones (base de datos)
- [ ] Implementar rate limiting para prevenir abuso
- [ ] Añadir botones de sugerencias de preguntas
- [ ] Integrar envío de emails directo desde el chat
- [ ] Agregar analytics para ver qué preguntan los recruiters
- [ ] Soporte para más idiomas (francés, alemán, etc.)
- [ ] Opción de exportar la conversación
- [ ] Modo de voz (speech-to-text)

---

¿Tienes preguntas? Abre un issue en el repositorio.
