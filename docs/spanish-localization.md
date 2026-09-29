# Spanish localization

`apps/web` supports English, French, Italian and Spanish (`es`, date locale
`es-ES`). Select **Español** using the language controls in the desktop account
menu or mobile drawer. Paraglide stores the local preference. For authenticated
users, the interface also attempts to save `ES` to the user before reloading.

## Scope

- Application catalog, fixed component text, suggested exercises, displayed dates
  and units.
- Emails, subjects, activity-processed notifications and Spanish AI feedback
  questions.
- Existing names, notes, messages, zones and workouts retain their stored language.
  Localization does not rewrite athlete data.
- Identifiers, enums, API units and sports calculations keep their original meaning.
- External-service messages and model-generated free text may retain their source
  language. Adding an interface locale does not guarantee every model's language.
- The public `apps/website` site, its articles and technical documentation have
  separate content systems and are outside this application translation.

## Terminology

The Spanish catalog uses Spanish from Spain and the informal singular form of
address. Review translations in their component context, comparing the English,
French and Italian catalogs where helpful.

| Concept                              | Spanish presentation                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Heart rate / HR                      | Frecuencia cardiaca / FC                                                       |
| Heart rate variability / HRV         | Variabilidad de la frecuencia cardiaca / VFC                                   |
| Resting heart rate / RHR             | FC en reposo                                                                   |
| Beats per minute / bpm               | ppm (pulsaciones por minuto)                                                   |
| Running cadence                      | pasos/min                                                                      |
| Rating of perceived exertion / RPE   | Esfuerzo percibido (RPE); keep RPE in short labels                             |
| Functional threshold power / FTP     | Umbral funcional de potencia (FTP)                                             |
| Chronic training load / CTL          | Carga crónica; indicador de forma física (CTL)                                 |
| Acute training load / ATL            | Carga aguda; indicador de fatiga (ATL)                                         |
| Training stress balance / TSB        | Balance de carga (TSB)                                                         |
| Vitesse maximale aérobie / VMA       | Velocidad aeróbica máxima (VAM); distinct from ascent speed                    |
| RMSSD                                | Keep RMSSD; raíz cuadrática media de diferencias sucesivas entre intervalos RR |
| SDNN                                 | Keep SDNN; desviación estándar de intervalos NN                                |
| VO₂ max / SpO₂                       | VO₂ máx. / SpO₂                                                                |
| Elevation gain / loss                | Desnivel positivo / negativo (D+ / D−)                                         |
| Workout step                         | Bloque                                                                         |
| Planned workout / completed activity | Entrenamiento planificado / actividad realizada                                |

Keep brand names such as OpenAthlete, Garmin and Body Battery. Use the full name
OpenAthlete in interface copy. RMSSD, SDNN and the provider's overnight HRV remain
separate metrics; translation must not imply equivalence.

## Installation and maintenance

Apply pending migrations, including the migration adding `ES` to `user_language`,
and regenerate Prisma:

```sh
pnpm database run db:deploy
pnpm database run db:generate
pnpm shared build
```

Restart the API after updating Prisma. Vite compiles Paraglide catalogs during
startup/build. Update all four files in `apps/web/messages` when adding UI copy:

```sh
pnpm check:translations
pnpm web exec tsc --noEmit
pnpm api exec tsc --noEmit
pnpm api exec jest --runInBand --runTestsByPath src/modules/notification/emails/core/layout.spec.ts
```

Translation checks validate keys and interpolated variables. Linguistic review
and visual checks are still necessary; successful compilation does not establish
translation quality. Technical documentation follows the separate
[documentation language policy](README.md#language-policy).

## Source references

- [Message catalogs](../apps/web/messages)
- [Translation checks](../scripts/check-translations.cjs)
