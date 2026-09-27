# Valoración de actividades y preguntas con IA

## Configuración y permisos

En el espacio Atleta: **Ajustes → Perfil → Validación de sesiones → Preguntas y análisis de valoración con IA**.

- Deben existir ajustes del atleta con `requireFeedbackQuestions: true`.
- El atleta o un entrenador vinculado debe tener acceso a `AI_RPE_QUESTIONS`.
- El modo `SELF_HOSTED=true` mantiene el acceso sin suscripción. Los proveedores de IA siguen necesitando sus credenciales.
- El modelo de preguntas se configura mediante `AI_MODEL_POST_ACTIVITY_FEEDBACK`; su valor predeterminado es `google/gemini-3-pro-preview`.
- Para usar OpenAI en lugar del valor predeterminado, define `AI_MODEL_POST_ACTIVITY_FEEDBACK=openai/gpt-5.1` y `OPENAI_API_KEY` en `apps/api/.env`, y reinicia la API. La clave de OpenAI no configura Gemini.
- Los avisos distinguen proveedor sin configurar, fallo al contactar con el proveedor y formato de preguntas inválido. Si las preguntas están desactivadas, se indica al atleta que consulte con su entrenador.
- El idioma de las preguntas es el del atleta. La transcripción usa el idioma de la interfaz enviado por el cliente (`es`, `en`, `fr`, `it`); sin ese parámetro, Whisper detecta el idioma.

## Generación bajo demanda

En el detalle de la actividad, el botón **Generar preguntas con IA** aparece cuando no hay preguntas. Lo pueden utilizar el atleta propietario y un entrenador vinculado. Permite generar preguntas para actividades antiguas o importadas mediante Garmin manual, sin volver a sincronizar con Garmin.

`POST /event/:eventId/activity/feedback-questions/generate`

El endpoint comprueba acceso de lectura al evento y la identidad del propietario o la relación del entrenador, además del ajuste y permiso de IA. Se comprueban de nuevo los permisos antes del guardado. Devuelve el mismo formato que `GET /event/:eventId/activity/feedback-questions`.

Las preguntas o respuestas existentes no se reemplazan. No hay regeneración destructiva ni editor de plantillas. Las peticiones simultáneas comparten una generación dentro del proceso. Un bloqueo breve de la fila de actividad, seguido de una nueva comprobación de preguntas existentes, evita duplicados entre procesos. La llamada al modelo queda fuera de la transacción; dos procesos distintos aún pueden hacer llamadas al proveedor, aunque solo uno guardará las preguntas.

La generación automática después de importar utiliza el mismo servicio. Las importaciones masivas, incluido Garmin manual, siguen sin activar llamadas automáticas a IA.

## Contexto y validación

Se envían resumen de la actividad, objetivos del entrenamiento o competición vinculados, último valor de las métricas almacenadas, zonas y lesiones registradas activas. No se inventan valores de FC ausentes. No se incluyen histórico de carga ni CTL/ATL/TSB; el prompt indica esa limitación.

La salida debe contener 3–4 preguntas diferentes, con texto no vacío de hasta 500 caracteres. Las opciones son opcionales; si se incluyen, deben ser de 2 a 8, con etiquetas no vacías de hasta 200 caracteres. Se rechazan claves inesperadas y respuestas que no cumplan el esquema antes de escribir. La llamada al modelo tiene un plazo de 120 segundos. Los fallos permiten reintentar y no reemplazan respuestas existentes.

## Responder y consultar

El encabezado del entrenador es **Valoración de la actividad**. Se distinguen cuestionario no generado, pendiente, omitido y completado. El entrenador puede leer también las preguntas pendientes de respuesta.

Solo el atleta propietario puede responder, editar, omitir o reabrir el cuestionario. Las respuestas se guardan individualmente como texto. El servidor acepta entre 1 y 5000 caracteres después de eliminar espacios exteriores. Un fallo de guardado conserva el texto y la pregunta actual; no muestra éxito ni avanza. Se bloquean envíos repetidos mientras se guarda. La reanudación empieza en la primera pregunta sin responder.

## Procesamiento posterior: sin inferencias escritas automáticamente

Completar las preguntas o guardar RPE y comentario puede actualizar la indexación semántica existente, si el ajuste y el acceso lo permiten. **No se crean lesiones ni se rellena un RPE ausente mediante IA.** Se mantienen las respuestas y el RPE introducidos por el atleta. Los registros anteriores no se modifican.

Todavía no se implementa una pantalla Accept/Edit/Reject para inferencias. Los agentes de extracción existentes quedan disponibles en el código para un futuro flujo revisado, pero este listener ya no los invoca.

## Embeddings y persistencia

La indexación usa `text-embedding-3-small`. Texto y vector se pasan como parámetros de Prisma y se valida que el vector contenga 1536 números finitos. Se comprueba de nuevo el ajuste antes del guardado. El UPSERT mantiene un embedding por actividad; no requiere migración ni reprocesa actividades antiguas por sí mismo.

## Validación

- Pruebas de permisos, ajuste desactivado, JSON inválido, concurrencia, conservación de respuestas y errores de proveedor.
- Pruebas de respuesta vacía, fallo de guardado, idioma de transcripción y ausencia de escrituras de lesiones/RPE.
- Regresiones de navegador para generación manual, estados, texto conservado, reintento y respuestas parciales.
- Comprobación en PostgreSQL con dos instancias del servicio, respuestas IA simuladas y datos ficticios eliminados al terminar.
