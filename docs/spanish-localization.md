# Español en la aplicación

La aplicación `apps/web` admite inglés, francés, italiano y español (`es`, fechas `es-ES`). Selecciona **Español** en el selector de idioma del encabezado. La preferencia local se guarda mediante Paraglide; si hay una sesión iniciada, se intenta guardar también `ES` en el usuario antes de recargar la página.

## Alcance

- Catálogo completo de la aplicación, textos fijos de componentes, ejercicios sugeridos, fechas y unidades de presentación.
- Correos, asuntos, notificación de actividad procesada y soporte de español en las preguntas de valoración generadas por IA.
- Los nombres, notas, mensajes, zonas y entrenamientos que ya están guardados conservan su contenido original. La traducción no reescribe los datos del atleta.
- Los identificadores, enumeraciones, unidades de la API y cálculos deportivos mantienen su significado original.
- Los mensajes recibidos de servicios externos y el contenido libre del modelo pueden conservar su idioma de origen. Añadir un idioma no garantiza el idioma de cada respuesta del modelo.
- La web pública `apps/website`, sus artículos y la documentación técnica tienen su propio sistema de contenidos y quedan fuera de esta traducción de la aplicación.

## Criterio terminológico

Se han contrastado los catálogos inglés, francés e italiano con los componentes donde aparecen los mensajes. Se utiliza español de España y el tratamiento de tú.

| Concepto                             | Presentación en español                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Heart rate / HR                      | Frecuencia cardiaca / FC                                                              |
| Heart rate variability / HRV         | Variabilidad de la frecuencia cardiaca / VFC                                          |
| Resting heart rate / RHR             | FC en reposo                                                                          |
| Beats per minute / bpm               | ppm (pulsaciones por minuto)                                                          |
| Running cadence                      | pasos/min                                                                             |
| Rating of perceived exertion / RPE   | Esfuerzo percibido (RPE); se mantiene RPE en etiquetas breves                         |
| Functional threshold power / FTP     | Umbral funcional de potencia (FTP)                                                    |
| Chronic training load / CTL          | Carga crónica; indicador de forma física (CTL)                                        |
| Acute training load / ATL            | Carga aguda; indicador de fatiga (ATL)                                                |
| Training stress balance / TSB        | Balance de carga (TSB)                                                                |
| Vitesse maximale aérobie / VMA       | Velocidad aeróbica máxima (VAM); no confundir con velocidad de ascenso                |
| RMSSD                                | Se conserva RMSSD; raíz cuadrática media de diferencias sucesivas entre intervalos RR |
| SDNN                                 | Se conserva SDNN; desviación estándar de intervalos NN                                |
| VO₂ max / SpO₂                       | VO₂ máx. / SpO₂                                                                       |
| Elevation gain / loss                | Desnivel positivo / negativo (D+ / D−)                                                |
| Workout step                         | Bloque                                                                                |
| Planned workout / completed activity | Entrenamiento planificado / actividad realizada                                       |

Se conservan marcas como Garmin y Body Battery. Las etiquetas no equiparan RMSSD, SDNN y la VFC nocturna del proveedor: siguen siendo métricas distintas.

## Instalación y mantenimiento

Aplicar la migración que añade `ES` al enum `user_language` y regenerar Prisma:

```sh
pnpm database run db:deploy
pnpm database run db:generate
pnpm shared build
```

Reiniciar la API después de actualizar el cliente de Prisma. Vite compila los catálogos de Paraglide al arrancar o compilar la aplicación.

Al añadir mensajes, actualizar los cuatro catálogos de `apps/web/messages` y ejecutar:

```sh
pnpm check:translations
pnpm web exec tsc --noEmit
pnpm api exec tsc --noEmit
pnpm api exec jest --runInBand --runTestsByPath src/modules/notification/emails/core/layout.spec.ts
```

La comprobación de traducciones valida claves y variables interpoladas. La revisión lingüística y la comprobación visual siguen siendo necesarias: no se deducen de que el catálogo compile.
