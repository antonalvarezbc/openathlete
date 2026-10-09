import type { BlogPost } from './types';

export const articlePreppingForGoal: BlogPost = {
  metadata: {
    slug: 'prepping-for-a-goal-adapting-when-life-happens',
    title: {
      en: 'Prepping for a Goal: Adapting When Life Happens',
      fr: "Préparer un Objectif : S'Adapter quand la Vie Arrive",
      es: 'Preparar un objetivo: adaptarse cuando la vida se cruza',
    },
    description: {
      en: 'The problem with rigid PDF plans: "Missed Tuesday due to a meeting, now what?" Discover how dynamic AI rescheduling keeps you on track toward your goals.',
      fr: 'Le problème avec les plans PDF rigides : "Manqué mardi à cause d\'une réunion, maintenant quoi ?" Découvrez comment le rééchelonnement dynamique de l\'IA vous garde sur la voie de vos objectifs.',
      es: 'El problema de los planes rígidos en PDF: «Me salté el martes por una reunión, ¿y ahora qué?». Descubre cómo la reprogramación dinámica con IA te mantiene en el camino hacia tus objetivos.',
    },
    excerpt: {
      en: 'Life happens. Meetings, travel, illness. Rigid training plans break when reality intervenes. AI-powered dynamic rescheduling adapts your plan instantly, keeping you on track.',
      fr: "La vie arrive. Réunions, voyages, maladie. Les plans d'entraînement rigides se cassent quand la réalité intervient. Le rééchelonnement dynamique alimenté par l'IA adapte votre plan instantanément, vous gardant sur la voie.",
      es: 'La vida pasa: reuniones, viajes, enfermedades. Los planes de entrenamiento rígidos se rompen en cuanto la realidad se impone. La reprogramación dinámica con IA adapta tu plan al instante y te mantiene en el buen camino.',
    },
    author: {
      name: 'OpenAthlete Team',
      email: 'contact@openathlete.org',
    },
    publishedAt: '2025-03-25',
    tags: [
      'Work Life Sport Balance',
      'Adapting Training Plan',
      'Flexible Training',
      'Goal Preparation',
    ],
    readingTime: 7,
    image:
      'https://images.unsplash.com/photo-1645822937278-5e84025713f3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4NDE1NDF8MHwxfHNlYXJjaHwxfHxtYXJhdGhvbiUyMGZpbmlzaCUyMGxpbmUlMjBnb2FsJTIwYWNoaWV2ZW1lbnQlMjB0YXJnZXQlMjByYWNlfGVufDB8MHx8fDE3NjUyODczODF8MA&ixlib=rb-4.1.0&q=80&w=1080',
  },
  ContentEn: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            You're 6 weeks into a 16-week marathon plan. Tuesday was supposed to
            be a tempo run, but you had a work emergency. Wednesday was supposed
            to be easy, but you're traveling. Thursday's long run? You're
            exhausted from the week. Your PDF plan is now useless.
          </strong>
        </p>

        <p>
          This is the reality of training for goals: life happens. Work, travel,
          family, illness—they all interfere with even the best-laid plans. The
          question isn't whether your plan will be disrupted. The question is:
          how do you adapt when it is?
        </p>

        <h2>The Rigid Plan Problem</h2>
        <p>Traditional training plans are static documents:</p>
        <ul>
          <li>
            Week 1: Monday tempo, Wednesday easy, Friday intervals, Sunday long
          </li>
          <li>
            Week 2: Monday tempo, Wednesday easy, Friday intervals, Sunday long
          </li>
          <li>Week 3: (Same pattern)</li>
        </ul>

        <p>
          When you miss a session, the plan doesn't adapt. You're left guessing:
        </p>
        <ul>
          <li>Do I skip it?</li>
          <li>Do I move it to tomorrow?</li>
          <li>Do I double up?</li>
          <li>How does this affect the rest of the week?</li>
          <li>Am I still on track for my goal?</li>
        </ul>

        <p>
          Without answers, you either abandon the plan or train incorrectly.
          Both lead to suboptimal results.
        </p>

        <h2>The Dynamic Solution</h2>
        <p>OpenAthlete's AI solves this with dynamic rescheduling:</p>

        <p>
          <strong>When you miss a session:</strong>
        </p>
        <ul>
          <li>AI instantly recalculates the week</li>
          <li>Prioritizes critical sessions (hard workouts, long runs)</li>
          <li>Moves or adjusts less critical sessions</li>
          <li>Maintains periodization principles</li>
          <li>Preserves your goal timeline</li>
        </ul>

        <p>
          <strong>When you're traveling:</strong>
        </p>
        <ul>
          <li>AI suggests travel-friendly alternatives</li>
          <li>Adjusts intensity based on available equipment</li>
          <li>Maintains training load despite constraints</li>
        </ul>

        <p>
          <strong>When you're fatigued:</strong>
        </p>
        <ul>
          <li>AI detects elevated RPE patterns</li>
          <li>Reduces intensity automatically</li>
          <li>Adds recovery days</li>
          <li>Resumes progression when ready</li>
        </ul>

        <h2>Real-World Example</h2>
        <p>Mark was 8 weeks into marathon training. Original plan:</p>
        <ul>
          <li>Monday: Rest</li>
          <li>Tuesday: Tempo run (critical)</li>
          <li>Wednesday: Easy run</li>
          <li>Thursday: Intervals (critical)</li>
          <li>Friday: Easy run</li>
          <li>Saturday: Rest</li>
          <li>Sunday: Long run (critical)</li>
        </ul>

        <p>
          Reality: Tuesday work emergency, Thursday travel, Friday exhausted.
        </p>

        <p>
          <strong>Without AI:</strong> Mark would skip Tuesday, try to do
          intervals Wednesday (wrong day), skip Thursday, skip Friday, and
          attempt long run Sunday (exhausted). Result: Poor week, lost fitness,
          demotivated.
        </p>

        <p>
          <strong>With OpenAthlete AI:</strong>
        </p>
        <ul>
          <li>Tuesday: Skipped (work emergency)</li>
          <li>Wednesday: Tempo run moved here (critical session preserved)</li>
          <li>Thursday: Travel-friendly easy run (maintains volume)</li>
          <li>Friday: Rest (recovery from travel)</li>
          <li>Saturday: Intervals moved here (critical session preserved)</li>
          <li>Sunday: Long run adjusted to 80% (accounts for fatigue)</li>
        </ul>

        <p>
          Result: Mark completed all critical sessions, maintained training
          load, stayed on track for his goal. The plan adapted to reality
          instead of breaking.
        </p>

        <h2>The Goal Preservation</h2>
        <p>
          The key insight: dynamic rescheduling preserves your goals. When life
          disrupts your plan, AI doesn't abandon your goal—it finds a new path
          to reach it.
        </p>

        <p>Consider your marathon goal. The critical elements are:</p>
        <ul>
          <li>Total training volume over 16 weeks</li>
          <li>Key workout completion (tempo, intervals, long runs)</li>
          <li>Progressive overload pattern</li>
          <li>Proper taper before race</li>
        </ul>

        <p>
          When you miss a Tuesday tempo run, AI doesn't say "goal failed." It
          says "how do we preserve these critical elements despite the
          disruption?" It recalculates, reschedules, and keeps you moving toward
          your goal.
        </p>

        <h2>The Flexibility Advantage</h2>
        <p>Dynamic rescheduling provides:</p>
        <ul>
          <li>
            <strong>Stress reduction:</strong> No guilt about missed sessions
          </li>
          <li>
            <strong>Consistency:</strong> Training continues despite disruptions
          </li>
          <li>
            <strong>Optimization:</strong> Plans adapt to your actual life
          </li>
          <li>
            <strong>Goal achievement:</strong> You reach targets despite
            obstacles
          </li>
        </ul>

        <p>
          Instead of abandoning plans when life happens, you adapt and continue.
          This is the difference between successful and unsuccessful goal
          achievement.
        </p>

        <h2>The Bottom Line</h2>
        <p>
          Life will disrupt your training. That's not a question—it's a
          certainty. The question is: do you have a plan that adapts, or one
          that breaks?
        </p>

        <p>
          Rigid PDF plans break when reality intervenes. Dynamic AI-powered
          plans adapt. They recalculate instantly, preserve critical sessions,
          maintain training load, and keep you on track toward your goals—even
          when life happens.
        </p>

        <p>
          Don't let a missed Tuesday derail your marathon goal. Don't let travel
          destroy your training consistency. Don't let fatigue force you to
          abandon your plan.
        </p>

        <p>
          <strong>Stop guessing, start training with AI today.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Sign up for OpenAthlete
          </a>{' '}
          and experience how dynamic rescheduling keeps you on track toward your
          goals, no matter what life throws at you.
        </p>
      </div>
    );
  },
  ContentFr: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Vous êtes à 6 semaines d'un plan marathon de 16 semaines. Mardi
            était censé être une sortie au seuil, mais vous avez eu une urgence
            au travail. Mercredi était censé être facile, mais vous voyagez. La
            sortie longue de jeudi ? Vous êtes épuisé de la semaine. Votre plan
            PDF est maintenant inutile.
          </strong>
        </p>

        <p>
          C'est la réalité de l'entraînement pour les objectifs : la vie arrive.
          Le travail, les voyages, la famille, la maladie—ils interfèrent tous
          avec même les meilleurs plans. La question n'est pas de savoir si
          votre plan sera perturbé. La question est : comment vous adaptez-vous
          quand c'est le cas ?
        </p>

        <h2>Le Problème du Plan Rigide</h2>
        <p>
          Les plans d'entraînement traditionnels sont des documents statiques :
        </p>
        <ul>
          <li>
            Semaine 1 : Lundi seuil, Mercredi facile, Vendredi intervalles,
            Dimanche long
          </li>
          <li>
            Semaine 2 : Lundi seuil, Mercredi facile, Vendredi intervalles,
            Dimanche long
          </li>
          <li>Semaine 3 : (Même modèle)</li>
        </ul>

        <p>
          Quand vous manquez une séance, le plan ne s'adapte pas. Vous êtes
          laissé à deviner :
        </p>
        <ul>
          <li>Est-ce que je la saute ?</li>
          <li>Est-ce que je la déplace à demain ?</li>
          <li>Est-ce que je double ?</li>
          <li>Comment cela affecte-t-il le reste de la semaine ?</li>
          <li>Suis-je toujours sur la voie pour mon objectif ?</li>
        </ul>

        <p>
          Sans réponses, vous abandonnez soit le plan soit vous vous entraînez
          incorrectement. Les deux mènent à des résultats sous-optimaux.
        </p>

        <h2>La Solution Dynamique</h2>
        <p>
          L'IA d'OpenAthlete résout cela avec un rééchelonnement dynamique :
        </p>

        <p>
          <strong>Quand vous manquez une séance :</strong>
        </p>
        <ul>
          <li>L'IA recalcule instantanément la semaine</li>
          <li>
            Priorise les séances critiques (entraînements durs, sorties longues)
          </li>
          <li>Déplace ou ajuste les séances moins critiques</li>
          <li>Maintient les principes de périodisation</li>
          <li>Préserve votre calendrier d'objectif</li>
        </ul>

        <p>
          <strong>Quand vous voyagez :</strong>
        </p>
        <ul>
          <li>L'IA suggère des alternatives adaptées aux voyages</li>
          <li>Ajuste l'intensité basée sur l'équipement disponible</li>
          <li>Maintient la charge d'entraînement malgré les contraintes</li>
        </ul>

        <p>
          <strong>Quand vous êtes fatigué :</strong>
        </p>
        <ul>
          <li>L'IA détecte les modèles de RPE élevé</li>
          <li>Réduit l'intensité automatiquement</li>
          <li>Ajoute des jours de récupération</li>
          <li>Reprend la progression quand prêt</li>
        </ul>

        <h2>Exemple Concret</h2>
        <p>Mark était à 8 semaines d'entraînement marathon. Plan original :</p>
        <ul>
          <li>Lundi : Repos</li>
          <li>Mardi : Sortie au seuil (critique)</li>
          <li>Mercredi : Sortie facile</li>
          <li>Jeudi : Intervalles (critique)</li>
          <li>Vendredi : Sortie facile</li>
          <li>Samedi : Repos</li>
          <li>Dimanche : Sortie longue (critique)</li>
        </ul>

        <p>Réalité : Urgence travail mardi, voyage jeudi, épuisé vendredi.</p>

        <p>
          <strong>Sans IA :</strong> Mark sauterait mardi, essaierait de faire
          intervalles mercredi (mauvais jour), sauterait jeudi, sauterait
          vendredi, et tenterait sortie longue dimanche (épuisé). Résultat :
          Mauvaise semaine, forme perdue, démotivé.
        </p>

        <p>
          <strong>Avec l'IA OpenAthlete :</strong>
        </p>
        <ul>
          <li>Mardi : Sauté (urgence travail)</li>
          <li>
            Mercredi : Sortie au seuil déplacée ici (séance critique préservée)
          </li>
          <li>Jeudi : Sortie facile adaptée aux voyages (maintient volume)</li>
          <li>Vendredi : Repos (récupération du voyage)</li>
          <li>Samedi : Intervalles déplacés ici (séance critique préservée)</li>
          <li>
            Dimanche : Sortie longue ajustée à 80% (tient compte de la fatigue)
          </li>
        </ul>

        <p>
          Résultat : Mark a complété toutes les séances critiques, maintenu la
          charge d'entraînement, resté sur la voie pour son objectif. Le plan
          s'est adapté à la réalité au lieu de se casser.
        </p>

        <h2>La Préservation de l'Objectif</h2>
        <p>
          L'idée clé : le rééchelonnement dynamique préserve vos objectifs.
          Quand la vie perturbe votre plan, l'IA n'abandonne pas votre
          objectif—elle trouve un nouveau chemin pour l'atteindre.
        </p>

        <p>Considérez votre objectif marathon. Les éléments critiques sont :</p>
        <ul>
          <li>Volume total d'entraînement sur 16 semaines</li>
          <li>
            Complétion des entraînements clés (seuil, intervalles, sorties
            longues)
          </li>
          <li>Modèle de surcharge progressive</li>
          <li>Affûtage approprié avant la course</li>
        </ul>

        <p>
          Quand vous manquez une sortie au seuil mardi, l'IA ne dit pas
          "objectif échoué." Elle dit "comment préservons-nous ces éléments
          critiques malgré la perturbation ?" Elle recalcule, rééchelonne et
          vous garde en mouvement vers votre objectif.
        </p>

        <h2>L'Avantage de la Flexibilité</h2>
        <p>Le rééchelonnement dynamique fournit :</p>
        <ul>
          <li>
            <strong>Réduction du stress :</strong> Pas de culpabilité sur les
            séances manquées
          </li>
          <li>
            <strong>Cohérence :</strong> L'entraînement continue malgré les
            perturbations
          </li>
          <li>
            <strong>Optimisation :</strong> Les plans s'adaptent à votre vie
            réelle
          </li>
          <li>
            <strong>Réalisation d'objectif :</strong> Vous atteignez les cibles
            malgré les obstacles
          </li>
        </ul>

        <p>
          Au lieu d'abandonner les plans quand la vie arrive, vous vous adaptez
          et continuez. C'est la différence entre la réalisation d'objectif
          réussie et non réussie.
        </p>

        <h2>En Résumé</h2>
        <p>
          La vie perturbera votre entraînement. Ce n'est pas une question—c'est
          une certitude. La question est : avez-vous un plan qui s'adapte, ou un
          qui se casse ?
        </p>

        <p>
          Les plans PDF rigides se cassent quand la réalité intervient. Les
          plans dynamiques alimentés par l'IA s'adaptent. Ils recalculent
          instantanément, préservent les séances critiques, maintiennent la
          charge d'entraînement et vous gardent sur la voie vers vos
          objectifs—même quand la vie arrive.
        </p>

        <p>
          Ne laissez pas un mardi manqué faire dérailler votre objectif
          marathon. Ne laissez pas les voyages détruire votre cohérence
          d'entraînement. Ne laissez pas la fatigue vous forcer à abandonner
          votre plan.
        </p>

        <p>
          <strong>
            Arrêtez de deviner, commencez à vous entraîner avec l'IA dès
            aujourd'hui.
          </strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Inscrivez-vous sur OpenAthlete
          </a>{' '}
          et découvrez comment le rééchelonnement dynamique vous garde sur la
          voie vers vos objectifs, peu importe ce que la vie vous lance.
        </p>
      </div>
    );
  },
  ContentEs: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Llevas 6 semanas de un plan de maratón de 16. El martes tocaba un
            rodaje a ritmo tempo, pero tuviste una urgencia en el trabajo. El
            miércoles tocaba rodaje suave, pero estás de viaje. ¿La tirada larga
            del jueves? Estás agotado de toda la semana. Tu plan en PDF ya no
            sirve para nada.
          </strong>
        </p>

        <p>
          Esta es la realidad de entrenar para un objetivo: la vida se cruza. El
          trabajo, los viajes, la familia, las enfermedades… todo interfiere
          hasta con el plan mejor pensado. La pregunta no es si tu plan se va a
          desbaratar. La pregunta es: ¿cómo te adaptas cuando ocurra?
        </p>

        <h2>El problema de los planes rígidos</h2>
        <p>
          Los planes de entrenamiento tradicionales son documentos estáticos:
        </p>
        <ul>
          <li>
            Semana 1: lunes tempo, miércoles suave, viernes series, domingo
            tirada larga
          </li>
          <li>
            Semana 2: lunes tempo, miércoles suave, viernes series, domingo
            tirada larga
          </li>
          <li>Semana 3: (el mismo patrón)</li>
        </ul>

        <p>
          Cuando te saltas una sesión, el plan no se adapta. Te toca adivinar:
        </p>
        <ul>
          <li>¿Me la salto?</li>
          <li>¿La paso a mañana?</li>
          <li>¿Hago dos sesiones el mismo día?</li>
          <li>¿Cómo afecta esto al resto de la semana?</li>
          <li>¿Sigo en camino de lograr mi objetivo?</li>
        </ul>

        <p>
          Sin respuestas, o abandonas el plan o entrenas mal. Las dos opciones
          llevan a resultados por debajo de lo que podrías lograr.
        </p>

        <h2>La solución dinámica</h2>
        <p>La IA de OpenAthlete lo resuelve con la reprogramación dinámica:</p>

        <p>
          <strong>Cuando te saltas una sesión:</strong>
        </p>
        <ul>
          <li>La IA recalcula la semana al instante</li>
          <li>
            Prioriza las sesiones clave (entrenamientos duros, tiradas largas)
          </li>
          <li>Mueve o ajusta las sesiones menos importantes</li>
          <li>Respeta los principios de periodización</li>
          <li>Mantiene el calendario hacia tu objetivo</li>
        </ul>

        <p>
          <strong>Cuando estás de viaje:</strong>
        </p>
        <ul>
          <li>La IA propone alternativas compatibles con el viaje</li>
          <li>Ajusta la intensidad según el material disponible</li>
          <li>Mantiene la carga de entrenamiento pese a las limitaciones</li>
        </ul>

        <p>
          <strong>Cuando estás fatigado:</strong>
        </p>
        <ul>
          <li>La IA detecta patrones de RPE elevado</li>
          <li>Reduce la intensidad automáticamente</li>
          <li>Añade días de recuperación</li>
          <li>Retoma la progresión cuando estás listo</li>
        </ul>

        <h2>Un ejemplo real</h2>
        <p>Mark llevaba 8 semanas preparando un maratón. Su plan original:</p>
        <ul>
          <li>Lunes: descanso</li>
          <li>Martes: rodaje a ritmo tempo (clave)</li>
          <li>Miércoles: rodaje suave</li>
          <li>Jueves: series (clave)</li>
          <li>Viernes: rodaje suave</li>
          <li>Sábado: descanso</li>
          <li>Domingo: tirada larga (clave)</li>
        </ul>

        <p>
          La realidad: urgencia en el trabajo el martes, viaje el jueves y
          agotamiento el viernes.
        </p>

        <p>
          <strong>Sin IA:</strong> Mark se habría saltado el martes, habría
          intentado hacer las series el miércoles (el día equivocado), se habría
          saltado el jueves y el viernes, y habría intentado la tirada larga del
          domingo agotado. Resultado: una mala semana, forma perdida y la
          motivación por los suelos.
        </p>

        <p>
          <strong>Con la IA de OpenAthlete:</strong>
        </p>
        <ul>
          <li>Martes: sesión saltada (urgencia en el trabajo)</li>
          <li>
            Miércoles: el rodaje tempo pasa a este día (sesión clave conservada)
          </li>
          <li>
            Jueves: rodaje suave compatible con el viaje (mantiene el volumen)
          </li>
          <li>Viernes: descanso (recuperación del viaje)</li>
          <li>Sábado: las series pasan a este día (sesión clave conservada)</li>
          <li>
            Domingo: tirada larga ajustada al 80 % (tiene en cuenta la fatiga)
          </li>
        </ul>

        <p>
          Resultado: Mark completó todas las sesiones clave, mantuvo su carga de
          entrenamiento y siguió en camino hacia su objetivo. El plan se adaptó
          a la realidad en lugar de romperse.
        </p>

        <h2>Preservar el objetivo</h2>
        <p>
          La idea clave: la reprogramación dinámica preserva tus objetivos.
          Cuando la vida desbarata tu plan, la IA no renuncia a tu objetivo:
          busca un nuevo camino para alcanzarlo.
        </p>

        <p>Piensa en tu objetivo de maratón. Los elementos clave son:</p>
        <ul>
          <li>El volumen total de entrenamiento a lo largo de 16 semanas</li>
          <li>
            Completar los entrenamientos clave (tempo, series, tiradas largas)
          </li>
          <li>Un patrón de sobrecarga progresiva</li>
          <li>Una buena puesta a punto antes de la carrera</li>
        </ul>

        <p>
          Cuando te saltas el rodaje tempo del martes, la IA no dice «objetivo
          fallido». Se pregunta «¿cómo preservamos estos elementos clave a pesar
          del imprevisto?». Recalcula, reprograma y te sigue acercando a tu
          objetivo.
        </p>

        <h2>La ventaja de la flexibilidad</h2>
        <p>La reprogramación dinámica te ofrece:</p>
        <ul>
          <li>
            <strong>Menos estrés:</strong> sin culpa por las sesiones perdidas
          </li>
          <li>
            <strong>Constancia:</strong> el entrenamiento continúa pese a los
            imprevistos
          </li>
          <li>
            <strong>Optimización:</strong> los planes se adaptan a tu vida real
          </li>
          <li>
            <strong>Objetivos cumplidos:</strong> alcanzas tus metas pese a los
            obstáculos
          </li>
        </ul>

        <p>
          En lugar de abandonar el plan cuando la vida se cruza, te adaptas y
          sigues adelante. Esa es la diferencia entre lograr un objetivo y
          quedarse a medio camino.
        </p>

        <h2>En resumen</h2>
        <p>
          La vida va a desbaratar tu entrenamiento. No es una posibilidad: es
          una certeza. La pregunta es: ¿tienes un plan que se adapta o uno que
          se rompe?
        </p>

        <p>
          Los planes rígidos en PDF se rompen cuando la realidad se impone. Los
          planes dinámicos con IA se adaptan. Recalculan al instante, conservan
          las sesiones clave, mantienen la carga de entrenamiento y te mantienen
          en el camino hacia tus objetivos, pase lo que pase.
        </p>

        <p>
          No dejes que un martes perdido descarrile tu objetivo de maratón. No
          dejes que los viajes acaben con tu constancia. No dejes que la fatiga
          te obligue a abandonar tu plan.
        </p>

        <p>
          <strong>Deja de adivinar y empieza hoy a entrenar con IA.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Regístrate en OpenAthlete
          </a>{' '}
          y comprueba cómo la reprogramación dinámica te mantiene en el camino
          hacia tus objetivos, te ponga la vida lo que te ponga por delante.
        </p>
      </div>
    );
  },
};
