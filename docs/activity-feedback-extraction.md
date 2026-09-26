# Extracción de valoraciones de actividad

## Política de activación

`ActivityFeedbackExtractionListener` aplica el mismo ajuste y permiso que la generación de preguntas:

- Deben existir ajustes del atleta con `requireFeedbackQuestions: true`.
- El atleta o su entrenador deben disponer de `AI_RPE_QUESTIONS` según `FeatureAccessService`, incluido el comportamiento existente del modo self-hosted.
- Si falta el ajuste, está desactivado o falta acceso, no se consulta a los agentes ni al proveedor de embeddings.

La interfaz describe el ajuste como **Preguntas y análisis de valoración con IA**. Su valor predeterminado existente sigue siendo `true` cuando se crean los ajustes. No se modifican preferencias guardadas.

Con el ajuste activado, completar las preguntas o guardar RPE y comentario puede iniciar la extracción automática. Puede guardar información sobre lesiones y completar un RPE ausente. No incluye una pantalla de revisión Accept/Edit/Reject; ese flujo requeriría un cambio de producto separado.

## RPE y transacción

Un RPE manual, incluido el valor cero, nunca se sustituye por la inferencia del modelo. Si falta al empezar la extracción, se infiere como antes, pero el UPDATE final exige que siga siendo NULL: así se conserva también un valor introducido mientras el modelo estaba trabajando.

La notificación al calendario se envía después de confirmar la transacción y solo si se actualizó el RPE. Un error de persistencia no anuncia una actualización inexistente.

## Embeddings

El texto y el vector se pasan como parámetros de Prisma. El vector textual se convierte mediante `::vector`, sin insertarlo como SQL con `Prisma.raw`. Antes de escribir se valida que contenga 1536 números finitos, de acuerdo con `text-embedding-3-small` y la columna `vector(1536)` existente.

El UPSERT mantiene un embedding por actividad. No requiere migración ni reprocesa automáticamente actividades existentes.

## Validación

- Tests con agentes y embedder simulados: ajuste desactivado/ausente, falta de acceso, conservación del RPE, edición concurrente, vector inválido y fallo de transacción.
- Tests de consulta parametrizada y rechazo de vectores inválidos.
- Prueba local de INSERT y UPSERT en PostgreSQL/pgvector con vectores sintéticos y una tabla temporal, sin tocar embeddings reales ni llamar a un LLM.

```sh
pnpm api exec jest --runInBand
pnpm api exec tsc --noEmit
pnpm check:translations
```
