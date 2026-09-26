# Importar planes JSON

En **Ajustes → Plan de entrenamiento**, pulsa **Importar plan JSON**.
Carga un archivo o pega el JSON, elige explícitamente al atleta y la fecha, revisa las
semanas, marca la confirmación y pulsa **Publicar en el calendario**. Puedes editar
el JSON antes de publicar. Cancelar no crea planes ni sesiones. La vista previa del
archivo es local; solo se envía al servidor al confirmar.

El [ejemplo de dos semanas](examples/training-plan.json) contiene datos ficticios.
No se necesita una API key ni se consulta un modelo LLM para importar un JSON.
La generación de una sesión con IA continúa siendo un flujo separado.

## Contrato

- Tamaño máximo del JSON: 90 kB, compatible con el límite HTTP existente.
- `plan.duration`: número entero de semanas; debe coincidir con la suma de semanas
  de todos los ciclos. Límite técnico: 104 semanas y 1500 sesiones por importación.
- `dayOfWeek`: entero, 0 domingo, 1 lunes, …, 6 sábado. Cada semana abarca siete días
  desde la fecha elegida: si empieza un lunes, el domingo es el último día.
- `goalDuration`: segundos enteros positivos. Si falta, el calendario reserva una hora
  pero el objetivo de duración queda sin especificar.
- `goalDistance` y `goalElevationGain`: metros no negativos. `goalRpe`: 0–10;
  se convierte a la escala interna 0–1. Cero se conserva.
- Las sesiones se sitúan a las 09:00 en la zona horaria del navegador; se respetan
  cambios de hora. La API acepta `timeZone` IANA y usa UTC si se omite.
- `workout.steps` utiliza los tipos existentes de OpenAthlete. Las repeticiones
  requieren hijos, admiten 1–99 repeticiones y no admiten repeticiones anidadas.
  Se admiten `repeatBlock` y el formato anterior `childSteps`/`repeatTimes`.
  `orderIndex` se admite por compatibilidad; prevalece el orden del array.
  Los descansos se representan como pasos; `restTime` no se importa.
- Campos desconocidos se rechazan. Custom Metrics, nutrición estructurada,
  reglas por fatiga y una biblioteca de ejercicios no forman parte de este formato.
- `plan.sportType`, `distance`, `timeTarget` y `elevationGainRange` son metadatos del
  formato SEO existente: no tienen columnas propias en TrainingPlan y no se guardan
  como objetivos estructurados del plan. Los objetivos de cada sesión sí se guardan.

La validación es estructural, no médica ni deportiva: un JSON válido puede contener
una carga inadecuada. El entrenador debe revisar la propuesta.

## Publicación, permisos y sustitución

El servidor comprueba que el usuario sea el atleta o su entrenador vinculado. Al
confirmar se crea un plan ACTIVE con ciclos, semanas, eventos y workouts en una sola
transacción PostgreSQL. No se crean sesiones antes de confirmar ni se usa DRAFT como
aparente aislamiento del calendario. No se dispara una exportación a Garmin.

Un plan con el mismo nombre, atleta y fecha de inicio se rechaza como duplicado.
Para sustituirlo, selecciona expresamente el plan existente. Se conservan su ID y el
atleta, y se sustituyen sus ciclos, semanas y sesiones. Solo se permiten planes aún
no iniciados, con sesiones futuras, sin actividades vinculadas, comentarios,
plantillas ni workouts exportados. No es una adaptación parcial de un plan en curso.

Los conflictos concurrentes se rechazan: revisa el calendario antes de reintentar.
El consumo de tokens temporales también es atómico. Los enlaces de token conservan
su comportamiento público y su expiración existente; no uses esa vía para publicar
datos privados. La carga de archivos utiliza el endpoint autenticado directamente.

## Endpoints

- `POST /seo-plan/import-json`: `{planData, athleteId, startDate, timeZone, replacePlanId?}`.
- `GET /seo-plan/athletes/:athleteId/plans`: planes disponibles para selección; requiere permiso.
- `POST /seo-plan/:token/import`: mismas opciones sin `planData`; requiere autenticación.
- `POST /seo-plan` y `GET /seo-plan/:token`: almacenamiento temporal público preexistente.

## Pruebas

```sh
pnpm shared build
pnpm api exec jest --runInBand
pnpm shared tsc:check
pnpm api tsc:check
pnpm web tsc:check
pnpm shared lint
pnpm api lint
pnpm web lint
```

Con API, PostgreSQL y cuentas ficticias vinculadas (`@openathlete.test`):

```sh
node scripts/test-json-plan-import.cjs lab/local-qa/accounts.json
```

El archivo de cuentas debe contener `coach` y `athlete`, cada uno con `email` y
`password`. No se versiona. La prueba inicia sesión por el endpoint normal y verifica
permisos, persistencia, fechas, duplicados, sustitución, concurrencia y rollback
inyectando un fallo en la segunda sesión. Elimina únicamente los planes y tokens
creados por esa ejecución. No llama a Garmin ni a un LLM.
