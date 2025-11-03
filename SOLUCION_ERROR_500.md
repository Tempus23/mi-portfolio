# 🚨 SOLUCIÓN RÁPIDA - Error 500 en Chat

## El problema
El error 500 indica que `GEMINI_API_KEY` no está configurada en Cloudflare Pages.

## Solución URGENTE (en Cloudflare Pages Dashboard):

### Paso 1: Configurar la variable de entorno

1. Ve a tu proyecto en Cloudflare Pages Dashboard
2. Haz clic en **Settings** (en el menú lateral)
3. Haz clic en **Environment variables**
4. Haz clic en **Add variable**
5. Completa:
   - **Variable name**: `GEMINI_API_KEY`
   - **Value**: Tu API key de Gemini (obtén una en https://aistudio.google.com/app/apikey)
   - **Environment**: Selecciona **Production** y **Preview** (ambos)
6. Haz clic en **Save**

### Paso 2: Redeploy

Después de configurar la variable:
1. Ve a **Deployments**
2. Haz clic en los **tres puntos** (...) del último deployment
3. Selecciona **Retry deployment**

O simplemente haz un nuevo **push** a tu repositorio para trigger un nuevo deployment.

---

## Para testing local (opcional):

Crea un archivo `.env` en la raíz del proyecto:

```bash
GEMINI_API_KEY=tu-clave-de-gemini-aqui
```

**Nota**: Este archivo NO se sube a Git (ya está en `.gitignore`).

---

## Verificar si funcionó:

Una vez redeployado, abre la consola del navegador (F12) cuando aparezca el error 500.
Deberías ver un mensaje más claro indicando si la API key está o no configurada.

---

## Si el problema persiste:

1. Verifica que la API key de Gemini sea válida en https://aistudio.google.com/app/apikey
2. Asegúrate de que no haya espacios extras al copiar la clave
3. Revisa los logs de Cloudflare Pages en **Deployments > [tu deployment] > View logs**
