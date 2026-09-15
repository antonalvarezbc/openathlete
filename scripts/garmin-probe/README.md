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

Además del diagnóstico, `sync.py` permite importar desde el botón de Ajustes →
Conexiones. Es opcional, requiere `SELF_HOSTED=true` y no usa el OAuth oficial.
No hay cron, webhooks nuevos, polling a Garmin ni reintentos desde la interfaz.
Cargar la pantalla solo consulta el estado local del backend.

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
   este directorio `scripts/garmin-probe` y mantener `SELF_HOSTED=true`.
5. Reconstruir shared (`pnpm shared build`) y reiniciar el backend. El backend
   debe poder ejecutar `.venv/bin/python`, leer los tokens y escribir `.private/`.
6. Abrir Ajustes → Conexiones con la cuenta del atleta o un entrenador ya vinculado.
   El botón «Update from Garmin» aparece según el idioma de la interfaz.

No se reciben contraseñas ni tokens desde el navegador. Si caduca la sesión,
ejecutar `probe.py --login` en el servidor. El worker comprueba la identidad
Garmin antes de devolver datos importables; una cuenta distinta detiene la operación.
Este MVP admite **una vinculación por instalación**. En un VPS, el directorio
privado debe estar en almacenamiento persistente, fuera del directorio público.
Todas las instancias del backend deben compartirlo; no está diseñado para varios
servidores con sistemas de archivos independientes.

### Alcance de cada pulsación

- Una consulta de hasta 100 resúmenes de actividades; se importan las que empiezan
  en los últimos 30 días. Si se alcanza 100, se muestra una advertencia: no hay
  paginación automática ni importación completa del histórico.
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
- Las actividades existentes no se modifican. Se reconocen los IDs de esta
  integración y del conector Garmin oficial. Coincidencias exactas de hora con
  otras actividades se omiten y avisan; no hay deduplicación aproximada entre
  plataformas si sus horas difieren.
- Los resúmenes no incluyen FIT, ruta GPS, series temporales, series adicionales no descritas arriba. No se ejecuta IA, cálculo de carga ni vinculación
  automática a entrenamientos planificados en este MVP.

El backend protege `GET /provider/garmin-manual/status` y
`POST /provider/garmin-manual/sync` con JWT y verifica propietario/entrenador.
Un bloqueo transaccional PostgreSQL impide sincronizaciones simultáneas; hay
120 segundos de espera entre intentos y 120 segundos máximos para el worker.
La biblioteca puede renovar tokens y realizar sus propias consultas de login.
Un endpoint opcional no disponible (404/501) se omite con aviso. Ante otros
errores de lectura, autenticación o límites, se aborta la importación completa; las escrituras de
actividades y métricas se realizan en una única transacción. Los resultados
locales de la última operación se conservan en `.private/sync-state.json`.

### Validación de la integración

Tests Python: comando de la sección anterior. Tests API:

```sh
pnpm --dir apps/api exec jest manual-garmin --runInBand
```

Primera prueba real: pulsar una vez, comprobar una actividad y una métrica en OA;
tras dos minutos, repetir y comprobar que no crecen los duplicados. No hacer
consultas remotas desde tests automáticos.

Evita activar a la vez la importación oficial Garmin o la de Strava para las
mismas actividades: la deduplicación entre proveedores tiene los límites
descritos arriba. No se cambia el comportamiento de sus conectores existentes.


### Métricas disponibles y límites de esta ampliación

El presupuesto máximo es de 27 llamadas de datos por pulsación: identidad (1),
actividades (1), resumen diario/HRV/sueño (21), rangos corporal/VO₂/presión (3) y
edad física (1), además del login/renovación que necesite la biblioteca.
No se consulta Garmin al abrir la ficha ni durante las pruebas automáticas.

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
