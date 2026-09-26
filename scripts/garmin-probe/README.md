# Prueba local de Garmin (no oficial)

Diagnóstico independiente del backend. Lee las tres actividades más recientes
(resúmenes, no archivos FIT) y siete días de sueño, HRV y pulso en reposo.
Por defecto termina ayer según la fecha local del equipo, para evitar un día incompleto.
No escribe en Garmin, OpenAthlete ni su base de datos. El login puede renovar tokens.
No habilita el botón oficial «Conectar Garmin».

## Ejecutar desde la raíz del repositorio

Requiere Python >=3.12 y venv. No necesita pnpm, Docker, Stripe ni claves de aplicación Garmin.

```sh
python3 -m venv scripts/garmin-probe/.venv
scripts/garmin-probe/.venv/bin/python -m pip install -r scripts/garmin-probe/requirements.txt
scripts/garmin-probe/.venv/bin/python scripts/garmin-probe/probe.py
```

Si falta venv en Mint/Ubuntu: `sudo apt install python3-venv`.
Introduce localmente la cuenta Garmin de Athleta con su autorización y el código MFA
si Garmin lo solicita. Nunca pegues contraseña ni tokens en el chat.
Las siguientes ejecuciones reutilizan la sesión. Para entrar de nuevo o cambiar
cuenta usa `--login`; solo se conserva una sesión local. Para elegir el último día:
`--end-date YYYY-MM-DD` (sustituye por una fecha real).

## Resultados y fallos

`.private/` contiene tokens y un informe JSON por ejecución. Está excluido de Git;
los archivos nuevos tienen permisos privados. Los informes incluyen datos personales
y de actividad: no los publiques. La terminal solo muestra estados y tipos de error.

- `received`: llegó una respuesta no vacía; NO demuestra que la métrica exista o sea correcta.
- `empty`: respuesta vacía; no se sustituye por cero ni se inventan valores.
- `error`: error registrado sin mensajes ni payloads de excepciones.
- Autenticación fallida: no se consultan actividades ni métricas.
- Ante 401/403/429 reconocidos o errores de autenticación/límite se detiene la prueba.
  El resto de errores permite comprobar los demás endpoints. No se reintenta automáticamente.

Comprueba en Garmin Connect las mismas fechas: duración/distancia/desnivel de una
actividad; sueño, HRV nocturna y pulso en reposo de un día. Conservamos respuestas
originales: todavía no convertimos unidades ni mapeamos campos. Un objeto puede contener
campos nulos aunque su estado sea `received`. Ausencia de datos no prueba ausencia de
soporte: puede depender del reloj, uso, fecha o endpoint.

Registra por caso: fecha, endpoint, estado, valor/unidad de Garmin Connect,
valor/campo JSON, coincidencia y observaciones. El código de salida es 1 si hay errores,
0 si no los hay (las respuestas vacías no provocan error).

## Verificaciones sin cuenta ni red

```sh
scripts/garmin-probe/.venv/bin/python -m unittest discover -s scripts/garmin-probe -v
```

## Alcance pendiente

El diagnóstico por sí solo no importa datos en OA. El conector manual descrito
a continuación añade esa importación. No hay sincronización programada,
exportación al reloj ni integración IA. La dependencia está fijada; el protocolo
no oficial puede cambiar.

Fuentes: https://github.com/cyberjunky/python-garminconnect y
https://pypi.org/project/garminconnect/0.3.15/.

## Conector manual en OpenAthlete (MVP)

Además del diagnóstico, el conector ofrece dos acciones independientes en
Ajustes → Conexiones del atleta y en la tabla de Atletas del entrenador:

- **Actualizar Garmin:** `sync.py` importa resúmenes recientes y recuperación.
- **Completar actividades pendientes:** `backfill.py` completa detalles mediante
  los FIT de actividades que ya están importadas en OA.

Está desactivado por defecto. Requiere `ENABLE_MANUAL_GARMIN_SYNC=true`,
`SELF_HOSTED=true` y no usa el OAuth oficial. No hay cron,
webhooks nuevos ni polling a Garmin. Cargar la pantalla solo consulta el estado
local del backend; ninguna de las dos acciones comienza automáticamente.

### Configuración inicial del administrador

1. Ejecutar el diagnóstico con éxito y verificar la cuenta Garmin.
2. Identificar **el ID del atleta en OpenAthlete**, no el ID de usuario ni del entrenador.
3. Vincular explícitamente la cuenta (sustituir `ID_DEL_ATLETA` por el número real):

   ```sh
   scripts/garmin-probe/.venv/bin/python scripts/garmin-probe/configure.py --athlete-id ID_DEL_ATLETA --timezone Europe/Madrid
   ```

   Se genera `.private/connection.json`, excluido de Git, usando la identidad
   Garmin del último informe correcto. No hace ninguna consulta remota.
   El comando rechaza sobrescribir una vinculación existente.

4. En `apps/api/.env`, añadir `GARMIN_UNOFFICIAL_DIRECTORY` con la ruta absoluta a
   este directorio `scripts/garmin-probe`, mantener `SELF_HOSTED=true` y añadir
   `ENABLE_MANUAL_GARMIN_SYNC=true`.
5. Reconstruir shared (`pnpm shared build`) y reiniciar el backend. El backend
   debe poder ejecutar `.venv/bin/python`, leer los tokens y escribir `.private/`.
6. Abrir Ajustes → Conexiones como atleta, o Ajustes → Atletas como entrenador
   vinculado. Aparecen las acciones «Actualizar Garmin» y «Completar actividades
   pendientes», según el idioma.

La configuración anterior es la vinculación heredada por CLI. También se puede
conectar cada cuenta desde la pantalla de Conexiones del propio atleta, con MFA
si Garmin lo solicita. Las credenciales se usan para iniciar sesión; se guardan
tokens privados por atleta, no contraseñas. El entrenador vinculado puede
sincronizar desde la tabla de Atletas, pero no configurar esas credenciales.
El worker verifica la identidad Garmin antes de devolver datos importables.
En un VPS, el almacenamiento privado debe ser persistente y compartido entre
instancias del backend. Véase [modos y Garmin manual](../../docs/account-modes-and-manual-garmin.md).

### Actualizar Garmin: actividades recientes y recuperación

- Actividades desde hace 42 días completos hasta hoy, incluido el día inicial.
  Se consultan páginas de 100 resúmenes solo hasta cubrir ese periodo o agotar
  el listado, con un máximo de cinco páginas por acción manual. Si se alcanza
  el límite o Garmin repite una página, se muestra que el historial puede estar
  incompleto. Se conservan las pausas y la parada ante errores, sin reintentos.
- Para TRIMP también hacen falta los FIT con registros de pulso y las métricas
  FC máxima (`HR_MAX`) y FC en reposo (`HR_REST`). Los FIT se siguen descargando
  mediante «Completar actividades pendientes». No se infiere FC máxima de los
  picos diarios ni se amplían las consultas de wellness a 42 días.
- Siete días de FC en reposo, mínima/máxima diaria, VFC nocturna y máxima de cinco
  minutos, sueño (duración/fases en horas), siestas y respiración media del sueño.
- Resumen diario: estrés y sus duraciones (minutos), Body Battery cargada/drenada,
  saturación media/mínima si el resumen las proporciona, pasos, distancia (km),
  calorías, minutos activos y pisos ascendidos.
- Una consulta por rango para mediciones corporales (masa en kg, IMC, grasa y
  agua corporal), otra para VO₂ máx. running/ciclismo y otra para presión arterial.
  Se conserva el día de cada medición, no se atribuye a hoy la media de un rango.
- Una consulta de edad física para hoy; solo se guarda si Garmin devuelve el valor.
- Incluye hoy según la zona horaria configurada; sus datos pueden estar incompletos.
- Ausencias no se convierten en cero ni borran valores anteriores.
- Se actualiza el valor existente por atleta/tipo/fecha, conservando las notas.
  La tabla de métricas actual no distingue el origen: también puede actualizar
  un valor introducido manualmente para esa misma fecha y tipo.
- Los resúmenes existentes se completan solo donde faltan datos: descripción vacía,
  FC, cadencia de carrera y potencia media/máxima/normalizada si Garmin las devuelve.
  Se conservan los valores existentes (incluidos ceros), nombres, fechas, RPE,
  comentarios y vínculos con entrenamientos. Se reconocen los IDs de esta
  integración y del conector Garmin oficial. Coincidencias exactas de hora con
  otras actividades se omiten y avisan; no hay deduplicación aproximada entre
  plataformas si sus horas difieren.

Esta acción no descarga FIT. Su presupuesto base es de 27 lecturas de datos:
identidad (1), actividades (1), resumen diario/VFC/sueño (21), rangos
corporal/VO₂/presión (3) y edad física (1), además de las consultas de
login/renovación necesarias. Hay al menos un segundo de pausa entre respuestas
y nuevas peticiones HTTP. Un endpoint opcional no disponible (404/501) se omite
con aviso; cualquier otro error de lectura detiene las consultas restantes.
Los resúmenes y métricas se guardan en una única transacción. La actualización
no se completa si falla el worker o la transacción.

### Completar actividades pendientes: detalles FIT

- Parte de los IDs Garmin ya almacenados para ese atleta en OA, incluidos los
  anteriores a 42 días. No vuelve a pedir el listado de actividades ni el
  histórico de recuperación. Por tanto, no descubre actividades antiguas que
  todavía no están importadas en OA.
- Revisa hasta 100 FIT por acción manual, con un máximo de 20 descargas nuevas.
  Tener una serie de tiempo no equivale a estar completo. Los archivos privados
  locales se reutilizan sin login ni consultas a Garmin; la conexión se inicia
  solo cuando hace falta descargar un archivo. Antes de descargar se verifica
  el perfil Garmin vinculado, mediante su identidad en la respuesta de FC en
  reposo; esta comprobación no importa métricas de recuperación.
- Las peticiones HTTP de esta acción se separan al menos 15 segundos desde la
  respuesta anterior, incluidas las de autenticación, renovación e identidad.
  La biblioteca usa un transporte local sin reintentos: el primer error impide
  que sus mecanismos internos generen nuevas peticiones.
- Al llegar al límite, se conserva lo importado y se muestra el trabajo pendiente.
  Otra pulsación explícita, cuando termine la espera indicada, continúa el lote.
  Un error de descarga, autenticación, lectura FIT o escritura detiene el lote;
  no se pasa automáticamente a otro archivo ni se reintenta el que ha fallado.
- Se incorporan GPS, FC, altitud, distancia, cadencia, potencia, temperatura y
  vueltas cuando el archivo las contiene. El resumen de una sesión FIT inequívoca
  puede completar FC, cadencia, potencia y trabajo mecánico (kJ); los kJ no se
  estiman a partir de calorías. Los canales de sensores ya guardados se conservan.
- El GPS nuevo solo se incorpora en tiempos coincidentes; los puntos válidos
  existentes se conservan y solo se rellenan huecos. No se interpolan posiciones.
  Si los tiempos no permiten alinear algún canal, se muestra el ID que necesita
  revisión manual. En ese caso tampoco se añaden vueltas nuevas.
- La revisión queda registrada por perfil Garmin, fila OA y versión del lector
  en el estado privado, después del commit de base de datos. Un FIT revisado
  puede no tener GPS (por ejemplo una actividad de interior); no se descarga
  indefinidamente por esa ausencia. Borrar/reimportar una actividad obliga a
  revisarla de nuevo. Los conflictos revisados se notifican sin reintentos remotos
  repetitivos; una actualización futura del lector puede volver a revisarlos.
- Al añadir datos de sensores o resumen se ejecuta el procesamiento habitual de
  OA (incluidos GAP, normalización y búsqueda de entrenamientos coincidentes).
  Se conservan los vínculos que ya existían. Este enriquecimiento utiliza el
  modo de importación histórica, también para resúmenes recién importados: no
  genera feedback IA, notificaciones de nueva actividad ni consultas meteorológicas.
- Cada FIT se importa en una transacción independiente. Una descarga fallida no
  deshace los archivos incorporados antes ni los resúmenes y métricas de una
  actualización anterior. Los FIT con varios originales, corruptos o mayores de
  20 MiB se rechazan. Las series con muestras ausentes que el lector no pueda
  alinear se omiten con aviso; no se importan todos los campos posibles del FIT.
  No se añaden modelos para dinámica de carrera, equipamiento del reloj, D− u
  otros campos que OA no representa actualmente.

### Progreso, parada y límites de consultas

- El trabajo se ejecuta en el backend. La pantalla consulta **solo el estado local**
  cada dos segundos mientras hay una operación activa; ese sondeo no llama a
  Garmin. Muestra FIT revisados, actividades enriquecidas, archivos reutilizados,
  descargas nuevas, fallidos, incompatibilidades y pendientes.
- El contador de pendientes se calcula al actualizar o iniciar un lote y se
  mantiene durante la importación. Puede quedar desactualizado si se añaden o
  eliminan actividades por otra vía hasta la siguiente operación manual; abrir
  la pantalla no vuelve a recorrer el histórico ni lo consulta en Garmin.
- **Detener** crea una señal local de cancelación. Una petición ya en curso puede
  terminar; no se inicia la siguiente. Se conserva el trabajo incorporado.
- Cerrar la página no cancela el trabajo mientras la API siga activa. Al volver
  se puede ver su progreso o resultado. Reiniciar o perder la API interrumpe el
  worker; no se reanuda automáticamente. El estado pasa a interrumpido cuando
  caduca su señal de actividad y requiere otra pulsación explícita.
- Hay un bloqueo compartido entre cuentas dentro de esta instalación para
  serializar el login con credenciales, la actualización y la descarga. Entre acciones
  remotas se esperan dos minutos desde la última respuesta, también si se intenta
  cambiar de atleta. Las operaciones de una misma cuenta conservan además su
  protección transaccional en PostgreSQL.
- Las pausas de un segundo y quince segundos y la prohibición de reintentos del
  transporte corresponden a las operaciones de lectura con tokens. El login
  inicial con credenciales y MFA comparte el bloqueo y las esperas entre
  operaciones, pero conserva la secuencia del SDK, que puede intentar vías de
  autenticación alternativas. No se garantiza la misma política de reintentos
  dentro de ese protocolo de login.
- Un 429 impone al menos una hora de espera, o el plazo `Retry-After` si es mayor.
  Este bloqueo y la espera normal se conservan en el almacenamiento privado y
  se muestran en la interfaz. Llegar a la hora indicada no inicia otra consulta:
  el usuario tiene que volver a pulsar. No se ofrecen garantías sobre la cuota de
  esta API no oficial; los límites anteriores son precauciones locales de OA.
- La actualización de resúmenes tiene un máximo de 180 segundos de worker,
  210 segundos de transacción y 240 segundos en el navegador. El lote FIT tiene
  un máximo de 15 minutos en el backend, con transacciones breves por archivo.
  Un tiempo agotado conserva los FIT ya incorporados y requiere continuación manual.

Los endpoints protegidos por JWT verifican propietario o entrenador vinculado:

- `GET /provider/garmin-manual/status`: estado local y progreso.
- `POST /provider/garmin-manual/sync`: actualizar resúmenes y recuperación.
- `POST /provider/garmin-manual/backfill`: iniciar un lote FIT manual.
- `POST /provider/garmin-manual/backfill/stop`: solicitar su parada.

Los resultados y revisiones por versión se conservan en
`.private/sync-state.json`; el progreso, en `.private/fit-backfill-state.json`.
La protección compartida usa `.private/request-safety.json` y un bloqueo de
archivo en el directorio raíz del conector. Los tokens y los FIT permanecen en
los directorios privados de sus respectivas cuentas/perfiles; no se publican
como URLs. Incluye ese almacenamiento privado en las copias de seguridad.

### Validación de la integración

Tests Python: comando de la sección anterior. Tests API:

```sh
pnpm --dir apps/api exec jest manual-garmin --runInBand
```

La validación automática usa respuestas simuladas; no demuestra una ejecución
real contra Garmin. Para la primera comprobación manual:

1. Pulsar «Actualizar Garmin» una vez y contrastar un resumen y una métrica en OA.
2. Esperar hasta la hora indicada y pulsar «Completar actividades pendientes».
   Comprobar progreso y datos de una actividad cuyo FIT contenga GPS.
3. Probar «Detener»: conservar los datos incorporados y continuar solo mediante
   otra pulsación, sin repetir las consultas de recuperación.
4. Tras finalizar, comprobar que no aparecen duplicados y que las actividades ya
   revisadas no se descargan otra vez. No provocar errores 429 para probarlos:
   esos casos se verifican con respuestas simuladas.

No hacer consultas remotas desde tests automáticos.

Evita activar a la vez la importación oficial Garmin o la de Strava para las
mismas actividades: la deduplicación entre proveedores tiene los límites
descritos arriba. No se cambia el comportamiento de sus conectores existentes.

### Métricas disponibles y límites de esta ampliación

No se importan todavía: HR_MAX fisiológica, HR_AVG_DAILY, HR_RESERVE, RMSSD,
Health Snapshots (sus seis métricas), RESPIRATION_RATE_AVG del día, HEIGHT,
VMA, FTP, potencia crítica, velocidad vertical ni FITNESS_INDEX. La lista de
campos visibles de OA es más amplia que las fuentes integradas. No se sustituyen
por máximas de una actividad, promedios de extremos ni estimaciones.
Presión arterial y composición corporal necesitan mediciones registradas;
poseer un reloj no garantiza que existan esos valores.

Fuentes adicionales para los contratos: `garminconnect/typed.py` de la versión
fijada y https://github.com/cyberjunky/ha-garmin (`client.py`: conversiones de
masa/estrés y estructura de presión arterial), junto con las unidades del mapper
Garmin oficial de OpenAthlete. Los endpoints nuevos requieren contraste en uso
real tras la siguiente pulsación; los tests solo validan mapeo y límites.

Para ver los datos importados, abrir la ficha de métricas del atleta en
`/dashboard/metrics/ID_DEL_ATLETA`. La vista del entrenador sin atleta seleccionado
no es la ficha de las métricas importadas.

## Ocultar las herramientas manuales en la aplicación

Para una instalación con la interfaz limpia, deja en `apps/api/.env`:

```dotenv
ENABLE_MANUAL_GARMIN_SYNC=false
ENABLE_MANUAL_FIT_IMPORT=false
```

Ambas opciones valen `false` si no se definen. Reinicia la API y recarga la web.
Se ocultan la tarjeta Garmin manual, su columna en Atletas y la subida manual de
FIT; los endpoints manuales también se deshabilitan. Las conexiones oficiales y
los datos ya importados se conservan. Cada herramienta se puede activar por
separado. Estos ajustes no cambian el comportamiento de los scripts de diagnóstico
cuando se ejecutan directamente desde la terminal.
