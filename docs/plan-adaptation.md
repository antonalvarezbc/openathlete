# Adaptar la siguiente sesión o el resto de la semana

En **Ajustes → Plan de entrenamiento → Adaptar plan en curso**:

1. Elige el atleta y un plan que tenga sesiones pendientes.
2. Selecciona **Siguiente sesión** o **Resto de la semana**. En el segundo caso,
   elige el primer día del periodo de siete días que quieras revisar.
3. Valora el estado actual y escribe las sensaciones, circunstancias y restricciones
   del entrenador. Estos datos complementan los registros almacenados.
4. Pulsa **Revisar contexto del atleta**. Puedes inspeccionar los datos que recibirá
   la IA antes de enviarlos al proveedor configurado.
5. Pulsa **Generar propuesta**. Revisa original, propuesta, explicación y bloques de
   cada sesión. Puedes editar duración/RPE o abrir la propuesta JSON completa.
6. Rechaza la propuesta o confirma la revisión y pulsa **Aceptar y aplicar cambios**.

La consulta del contexto y la generación no escriben en el calendario. Solo la
aceptación guarda cambios. No se modifican actividades realizadas, sesiones pasadas,
competiciones ni sesiones ajenas al plan seleccionado. Las fechas permanecen fijas por defecto. Activa **Permitir redistribuir sesiones entre días**
para que la IA proponga movimientos. Revisa la fecha original y la propuesta antes de aceptar.
Solo se permite mover dentro del periodo seleccionado y de la semana original del plan,
sin pasar al pasado ni solaparse con otras entradas del calendario. En Siguiente sesión,
el periodo empieza el día de esa sesión y abarca siete días, limitado también por su semana.
Sin permiso de añadir sesiones, no crea sesiones nuevas. No acumula automáticamente entrenamientos perdidos.

La propuesta usa el idioma de la interfaz del entrenador, aunque el atleta tenga otro idioma.
Las sesiones KEEP conservan sus textos originales. Las propuestas anteriores deben regenerarse.

## Permisos independientes

Las sesiones elegibles ya se pueden mantener, reducir o editar dentro de sus límites sin
activar ninguna casilla. «Aumentar carga» autoriza superar los objetivos de las existentes
hasta el porcentaje elegido. «Añadir sesiones» autoriza crear otras, dentro del máximo
adicional de sesiones, minutos y RPE. Al marcar ambas se permiten las dos operaciones.
No habilitan una modificación del plan completo: sigue vigente el periodo seleccionado.
El máximo de minutos adicionales es un techo, no una cantidad que la IA deba completar.

## Aumentar carga

Es una opción, no el objetivo por defecto. Marca **Permitir aumentar la carga de las sesiones existentes**
solo tras seleccionar **Recuperado, buenas sensaciones**, y establece un máximo de
0–25 %. La interfaz propone inicialmente 10 % como ajuste técnico configurable,
no como recomendación de progresión deportiva. El modelo puede mantener o reducir
la sesión aunque hayas habilitado un aumento.

Ejemplo de uso de la interfaz con datos ficticios: una sesión de 60 minutos podría
proponerse en 63 minutos (+5 %), conservando la intensidad, si el entrenador permite
ese cambio y revisa la justificación. No constituye una prescripción para un atleta.

El servidor comprueba:

- Autorización explícita de aumento, estado READY y ausencia de lesiones registradas
  sin resolver. Fatiga, enfermedad, dolor o estado desconocido bloquean los aumentos.
- Límite por sesión sobre duración, distancia, D+ y RPE, y sobre los totales de las sesiones seleccionadas.
- Duraciones de los bloques, máximos de sus objetivos y exposición calculada como
  objetivo × duración × repeticiones, comparando unidades iguales.
- Ausencia de aumentos desde bases desconocidas o cero. Si falta `goalDuration`, el
  contexto identifica la duración como inferida del calendario y no permite aumentarla.
- Coherencia básica de los bloques, zonas pertenecientes al atleta y solapamientos
  causados por alargar una sesión.

Estos controles no son un modelo fisiológico ni una garantía médica. Tampoco
interpretan exhaustivamente intensidad, cambios de deporte o instrucciones en texto
libre. El entrenador debe revisar todas las propuestas. No se usa una lectura aislada
de VFC como autorización automática para aumentar carga.

## Contexto que se envía

- Nombre, descripción, objetivo y fechas del plan seleccionado.
- Sesiones pendientes elegibles, objetivos, bloques y calendario alrededor de ellas,
  incluidas competiciones y entrenamientos ya vinculados a actividades. Las descripciones
  y bloques de las elegibles están en `sessions.original`; el calendario circundante
  también incluye descripciones, bloques, semana/plan y una marca `editable`.
  Una entrada de contexto no elegible nunca queda autorizada para modificar por incluirla aquí.
- Hasta 100 actividades de los últimos 28 días: duración, distancia, D+, FC media,
  RPE convertido a 0–10, descripción y entradas de carga almacenadas, separadas por método.
- Hasta 10 comentarios por actividad, limitados a hilos de los que el usuario sea
  participante; fecha y texto limitado a 1500 caracteres. Descripciones: 3000 caracteres.
- Métricas fechadas de esos 28 días: VFC nocturna media y máxima de cinco minutos,
  FC en reposo, duración y puntuación de sueño, estrés medio, Body Battery cargada/
  consumida, RMSSD, FC máxima y VO₂máx, con las unidades existentes.
- Zonas de entrenamiento y lesiones registradas sin resolver.
- Estado actual, valoración e instrucciones introducidos para esta propuesta.

Las métricas se leen de `AthleteMetric`, donde pueden existir datos sincronizados de
Garmin o introducidos por otras vías. Esta lectura no consulta Garmin. Los datos
faltantes se identifican; no se inventan mediciones ni se interpretan como cero.
No se calcula un ATL/CTL/TSB nuevo ni se consulta un historial completo de 42 días.

Se excluyen campos de nombre/correo del perfil, credenciales, claves, streams GPS/FC
crudos y conversaciones generales. Los textos libres del propio plan y comentarios
pueden contener información personal: aparecen en la revisión previa al envío.

## Modelo y persistencia

Agente nuevo sin herramientas de escritura, con el modelo de modificación ya
configurado por `AI_MODEL_EVENT_MODIFICATION`. Reutiliza las claves existentes y
la comprobación de acceso `AI_GENERATION` para generar. No añade dependencias ni
migraciones. La respuesta estructurada se valida antes de presentarla y otra vez
antes de guardarla, incluidas las ediciones del entrenador. Si el formato es legible
pero incumple una regla, se devuelve el borrador junto con `validationIssue` (código
y sesión cuando corresponde). La interfaz muestra el motivo traducido y bloquea su
aceptación. Puede corregirse mediante edición o conversación; la siguiente revisión
recibe también la infracción detectada. El servidor conserva todas las validaciones
al guardar. Si no cumple el esquema de salida, se muestra una revisión previa con el contenido
recuperable del modelo y el chat. No se habilita la aceptación. Cada revisión puede
volver a fallar sin perder el acceso al chat; al obtener una estructura válida,
aparecen las tarjetas de sesiones y la confirmación habitual. Si el SDK no conserva
el texto, se indica explícitamente y se permite regenerar usando el mismo contexto.
No se muestran mensajes internos, credenciales ni cabeceras del proveedor.
El borrador sin validar tiene un máximo de 100 000 caracteres y las últimas diez
revisiones se mantienen solo en la interfaz; recargar la página pierde la conversación.

La aceptación vuelve a leer el contexto y compara su huella con la revisada. Si han
cambiado las sesiones, actividades, métricas u otros datos relevantes, exige una
propuesta nueva. Las escrituras de toda la selección son atómicas: si falla una,
se revierte todo. Las propuestas no aceptadas solo permanecen en la interfaz.

REST conserva la entrada planificada con objetivos a cero, deporte OTHER y sin
workout; no elimina actividades ni comentarios. Los workouts ya exportados están
protegidos: este flujo no puede cambiarlos ni actualiza dispositivos externos.
La estimación de carga de una sesión modificada queda invalidada (`estimatedLoad`
a null); no se llama automáticamente a otro modelo para recalcularla.

## Pruebas locales

```sh
pnpm shared build
pnpm api exec jest --runInBand
node scripts/test-plan-adaptation.cjs lab/local-qa/accounts.json
```

El script de integración requiere API/PostgreSQL y las cuentas ficticias vinculadas
`@openathlete.test`. Verifica permisos, contexto, rechazo de aumentos no autorizados,
aumento explícito, protección contra propuestas desactualizadas, descanso y rollback
ante fallo intermedio. No llama a un LLM ni a Garmin; elimina sus propios datos.

Los endpoints son `POST /agent/ai/plan-adaptation/context`, `/propose`, `/refine` y `/apply`.

## Añadir sesiones a una semana recuperada

Selecciona **Resto de la semana**, la fecha de inicio correcta y el estado **Recuperado**.
Activa **Permitir añadir sesiones además de adaptar las existentes** y revisa los límites de número, minutos
adicionales **totales máximos** y RPE máximo. El presupuesto es un techo, no un objetivo: la IA puede proponer menos minutos, menos sesiones o ninguna. Estos límites son independientes del porcentaje
para aumentar sesiones existentes; autorizan una ampliación explícita de la semana.
El modelo puede proponer menos sesiones o ninguna según la evidencia disponible.

Las nuevas sesiones aparecen separadas, con fecha y justificación. Puedes descartar
cada una o editar el JSON antes de confirmar. Solo la aceptación crea eventos del mismo
atleta, vinculados a una semana existente del plan. Se comprueban permisos, recuperación,
lesiones, fechas futuras, límites y solapamientos. Se guardan en la misma transacción
que las modificaciones: un fallo revierte todo y una propuesta ya aplicada queda obsoleta.

Las sesiones nuevas incluyen deporte, duración, RPE, descripción y un workout estructurado
obligatorio. Los bloques usan tiempo y objetivos RPE absolutos opcionales, acotados por
el máximo autorizado. Admiten repeticiones simples y su duración total debe coincidir con
la sesión. Se guardan como Workout/WorkoutStep/targets de OpenAthlete, visibles en el
entrenamiento estructurado. Las nuevas altas aún no incluyen objetivos de distancia o D+.
También se puede estructurar una sesión existente sin bloques mediante UPDATE, respetando
sus objetivos de duración y RPE. No se rellenan automáticamente sesiones ya guardadas.

Una semana puede estar vacía y recibir nuevas sesiones si pertenece al plan y sigue
siendo futura. No crea semanas ni amplía las fechas del plan. Al seleccionar un plan
que empieza más adelante, la interfaz selecciona inicialmente su primer día.

El mensaje de ausencia de sesiones significa que no hay entrenamientos del **plan
seleccionado** sin actividad vinculada cuya **hora de inicio** sea futura dentro del
periodo elegido. Una sesión suelta del calendario o una sesión de otra semana no entra
en ese filtro. Los errores se muestran traducidos mediante códigos estables del servidor;
los errores inesperados no muestran mensajes del proveedor en otro idioma.


## Afinar la propuesta con la IA

Tras generar un borrador, escribe en **Afinar con la IA** y pulsa **Enviar y revisar propuesta**.
Puedes pedir cambios o una explicación. Cada turno envía el borrador completo (incluidas
las ediciones manuales), el comentario y las últimas diez revisiones (comentario/resumen).
La IA devuelve la propuesta completa y explica su respuesta en el resumen. La interfaz
conserva el borrador si falla la petición y desmarca la confirmación después de cada revisión.

El endpoint `POST /agent/ai/plan-adaptation/refine` usa autenticación, permiso AI_GENERATION,
validación de entrada y de salida, autorización sobre atleta/plan y comprobación del contexto.
No escribe en la base de datos. Todos los límites se comparan con el calendario original,
no con el último borrador, evitando acumular aumentos entre turnos. Si el calendario cambia,
hay que generar una propuesta nueva. Cambiar parámetros/permisos reinicia el borrador.
La conversación solo vive en la página: al cerrarla o recargarla se pierde. Las propuestas
previas sin bloques en sesiones nuevas deben regenerarse para cumplir el nuevo formato.


## Verificación

- 120 pruebas API: permisos, idioma, límites de aumento, redistribución, nuevas sesiones,
  bloques y refinamiento con el calendario original como referencia.
- Comprobaciones de tipos y lint en API, web y shared; paridad de los cuatro idiomas.
- PostgreSQL: modificaciones y altas atómicas, reversión ante fallos intermedios,
  protección de actividades, rechazo de duplicados y persistencia de bloques/objetivos RPE.
- Endpoint de revisión: rechaza contexto obsoleto, comentario vacío y atleta sin autorización
  antes de llamar al modelo.
- Chromium, con respuestas de IA simuladas: error en español, bloques visibles, fallo sin
  pérdida del borrador, dos revisiones con historial y guardado real solo tras confirmar.
  Comprobado en escritorio y móvil; datos ficticios eliminados al terminar.

Las comprobaciones actuales de refinamiento usan respuestas de IA simuladas. No demuestran
que cada salida del proveedor sea válida; toda respuesta real pasa por la misma validación.


Compatibilidad del formato del modelo: los bloques simples pueden omitir `repeatBlock`
(se normaliza a null). Un contenedor REPEAT puede declarar duración 0 o null, porque su
duración se calcula a partir de sus hijos; sus bloques de trabajo mantienen la validación
positiva. Los fallos de formato del SDK se convierten en un error traducible y no guardan cambios.
Una propuesta sin sesiones puede mostrar una explicación, pero no se puede aplicar vacía.

Prueba real adicional de generación con datos ficticios: HTTP 201, dos sesiones conservadas
y una nueva de 20 minutos con tres bloques, por debajo del máximo de 300 minutos. No se
aplicó esa propuesta. La cabecera de adaptación y sus acciones usan el icono de IA compartido.
