import type { BlogPost } from './types';

export const articleSyncWorkouts: BlogPost = {
  metadata: {
    slug: 'how-to-sync-workouts-to-garmin-polar-polar',
    title: {
      en: 'How to Sync Workouts to Garmin, Suunto, and Polar',
      fr: 'Comment Synchroniser les Entraînements vers Garmin, Suunto et Polar',
      es: 'Cómo sincronizar entrenamientos con Garmin, Polar y Polar',
    },
    description: {
      en: 'Tutorial: "Gateway" article. Show how to sync manually, then show how OpenAthlete does it automatically.',
      fr: 'Tutoriel : Article "passerelle". Montrez comment synchroniser manuellement, puis montrez comment OpenAthlete le fait automatiquement.',
      es: 'Tutorial: artículo de «puerta de entrada». Cómo sincronizar a mano y cómo lo hace OpenAthlete de forma automática.',
    },
    excerpt: {
      en: 'Learn how to send workouts to your watch manually, then discover how OpenAthlete automates this process for seamless training execution.',
      fr: "Apprenez comment envoyer des entraînements à votre montre manuellement, puis découvrez comment OpenAthlete automatise ce processus pour une exécution d'entraînement transparente.",
      es: 'Aprende a enviar entrenamientos a tu reloj a mano y descubre cómo OpenAthlete automatiza el proceso para que ejecutes tus sesiones sin complicaciones.',
    },
    author: {
      name: 'OpenAthlete Team',
      email: 'contact@openathlete.org',
    },
    publishedAt: '2025-04-15',
    tags: [
      'Send Workout to Garmin',
      'Suunto Sync',
      'Polar API',
      'Watch Integration',
    ],
    readingTime: 6,
    image:
      'https://images.unsplash.com/photo-1635863898961-e91351fc1741?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4NDE1NDF8MHwxfHNlYXJjaHwxfHxzbWFydHdhdGNoJTIwc3luYyUyMHdvcmtvdXQlMjB0cmFuc2ZlciUyMGRldmljZSUyMHRlY2hub2xvZ3l8ZW58MHwwfHx8MTc2NTI4NzM4MHww&ixlib=rb-4.1.0&q=80&w=1080',
  },
  ContentEn: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            You have a training plan. You want it on your watch. But how? Manual
            entry? Garmin Connect? Third-party apps? The process is confusing,
            time-consuming, and error-prone.
          </strong>
        </p>

        <p>
          This guide shows you how to sync workouts to your watch—both manually
          and automatically. Whether you use Garmin, Suunto, or Polar, we'll
          cover the options.
        </p>

        <h2>Manual Sync Methods</h2>
        <p>
          <strong>Garmin:</strong>
        </p>
        <ol>
          <li>Create workout in Garmin Connect</li>
          <li>Send to device via Bluetooth</li>
          <li>Sync watch</li>
        </ol>

        <p>
          <strong>Suunto:</strong>
        </p>
        <ol>
          <li>Use the Suunto app</li>
          <li>Create workout plan</li>
          <li>Sync via app</li>
        </ol>

        <p>
          <strong>Polar:</strong>
        </p>
        <ol>
          <li>Use Polar Flow</li>
          <li>Create training target</li>
          <li>Sync to watch</li>
        </ol>

        <p>
          <strong>Problems with manual sync:</strong>
        </p>
        <ul>
          <li>Time-consuming (5-10 minutes per workout)</li>
          <li>Error-prone (wrong paces, missed intervals)</li>
          <li>No automatic updates when plans change</li>
          <li>Requires multiple apps/platforms</li>
        </ul>

        <h2>The Automatic Solution</h2>
        <p>OpenAthlete automates this entire process:</p>
        <ul>
          <li>
            <strong>One-click sync:</strong> Plans appear on your watch
            instantly
          </li>
          <li>
            <strong>Automatic updates:</strong> When plans change, watch updates
            automatically
          </li>
          <li>
            <strong>Error-free:</strong> No manual entry mistakes
          </li>
          <li>
            <strong>Multi-device:</strong> Works with Garmin, Suunto, Polar, and
            more
          </li>
        </ul>

        <p>
          <strong>How it works:</strong>
        </p>
        <ol>
          <li>Coach creates plan in OpenAthlete</li>
          <li>Plan syncs to athlete's watch automatically</li>
          <li>Athlete sees workout on watch, ready to execute</li>
          <li>When plan updates, watch updates automatically</li>
        </ol>

        <h2>The Bottom Line</h2>
        <p>
          Manual sync works, but it's tedious. Automatic sync saves time,
          prevents errors, and ensures your watch always has the latest plan.
          OpenAthlete makes this seamless.
        </p>

        <p>
          <strong>Stop guessing, start training with AI today.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Sign up for OpenAthlete
          </a>{' '}
          and experience automatic workout sync to your watch.
        </p>
      </div>
    );
  },
  ContentFr: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Vous avez un plan d'entraînement. Vous le voulez sur votre montre.
            Mais comment ? Saisie manuelle ? Garmin Connect ? Apps tierces ? Le
            processus est confus, chronophage et sujet aux erreurs.
          </strong>
        </p>

        <p>
          Ce guide vous montre comment synchroniser les entraînements sur votre
          montre—à la fois manuellement et automatiquement. Que vous utilisiez
          Garmin, Suunto ou Polar, nous couvrirons les options.
        </p>

        <h2>Méthodes de Synchronisation Manuelle</h2>
        <p>
          <strong>Garmin :</strong>
        </p>
        <ol>
          <li>Créer entraînement dans Garmin Connect</li>
          <li>Envoyer à l'appareil via Bluetooth</li>
          <li>Synchroniser la montre</li>
        </ol>

        <p>
          <strong>Suunto :</strong>
        </p>
        <ol>
          <li>Utiliser l'app Suunto</li>
          <li>Créer plan d'entraînement</li>
          <li>Synchroniser via app</li>
        </ol>

        <p>
          <strong>Polar :</strong>
        </p>
        <ol>
          <li>Utiliser Polar Flow</li>
          <li>Créer cible d'entraînement</li>
          <li>Synchroniser sur montre</li>
        </ol>

        <p>
          <strong>Problèmes avec synchronisation manuelle :</strong>
        </p>
        <ul>
          <li>Chronophage (5-10 minutes par entraînement)</li>
          <li>Sujet aux erreurs (mauvaises allures, intervalles manqués)</li>
          <li>Pas de mises à jour automatiques quand les plans changent</li>
          <li>Nécessite plusieurs apps/plateformes</li>
        </ul>

        <h2>La Solution Automatique</h2>
        <p>OpenAthlete automatise tout ce processus :</p>
        <ul>
          <li>
            <strong>Synchronisation en un clic :</strong> Les plans apparaissent
            sur votre montre instantanément
          </li>
          <li>
            <strong>Mises à jour automatiques :</strong> Quand les plans
            changent, la montre se met à jour automatiquement
          </li>
          <li>
            <strong>Sans erreur :</strong> Pas d'erreurs de saisie manuelle
          </li>
          <li>
            <strong>Multi-appareil :</strong> Fonctionne avec Garmin, Suunto,
            Polar et plus
          </li>
        </ul>

        <p>
          <strong>Comment ça fonctionne :</strong>
        </p>
        <ol>
          <li>Le coach crée le plan dans OpenAthlete</li>
          <li>
            Le plan se synchronise sur la montre de l'athlète automatiquement
          </li>
          <li>L'athlète voit l'entraînement sur la montre, prêt à exécuter</li>
          <li>
            Quand le plan se met à jour, la montre se met à jour automatiquement
          </li>
        </ol>

        <h2>En Résumé</h2>
        <p>
          La synchronisation manuelle fonctionne, mais c'est fastidieux. La
          synchronisation automatique économise du temps, prévient les erreurs
          et assure que votre montre a toujours le dernier plan. OpenAthlete
          rend cela transparent.
        </p>

        <p>
          <strong>
            Arrêtez de deviner, commencez à vous entraîner avec l'IA dès
            aujourd'hui.
          </strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Inscrivez-vous sur OpenAthlete
          </a>{' '}
          et découvrez la synchronisation automatique des entraînements sur
          votre montre.
        </p>
      </div>
    );
  },
  ContentEs: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Tienes un plan de entrenamiento. Lo quieres en tu reloj. Pero ¿cómo?
            ¿Introducirlo a mano? ¿Con Garmin Connect? ¿Con aplicaciones de
            terceros? El proceso es confuso, lleva tiempo y da pie a errores.
          </strong>
        </p>

        <p>
          Esta guía te muestra cómo sincronizar entrenamientos con tu reloj,
          tanto a mano como de forma automática. Uses Garmin, Polar o Polar,
          repasamos todas las opciones.
        </p>

        <h2>Métodos de sincronización manual</h2>
        <p>
          <strong>Garmin:</strong>
        </p>
        <ol>
          <li>Crea el entrenamiento en Garmin Connect</li>
          <li>Envíalo al dispositivo por Bluetooth</li>
          <li>Sincroniza el reloj</li>
        </ol>

        <p>
          <strong>Polar:</strong>
        </p>
        <ol>
          <li>Usa Polar Training Hub</li>
          <li>Crea el plan de entrenamiento</li>
          <li>Sincroniza desde la app</li>
        </ol>

        <p>
          <strong>Polar:</strong>
        </p>
        <ol>
          <li>Usa Polar Flow</li>
          <li>Crea un objetivo de entrenamiento</li>
          <li>Sincronízalo con el reloj</li>
        </ol>

        <p>
          <strong>Problemas de la sincronización manual:</strong>
        </p>
        <ul>
          <li>Lleva tiempo (5-10 minutos por entrenamiento)</li>
          <li>Da pie a errores (ritmos equivocados, series olvidadas)</li>
          <li>No se actualiza automáticamente cuando cambia el plan</li>
          <li>Obliga a usar varias apps y plataformas</li>
        </ul>

        <h2>La solución automática</h2>
        <p>OpenAthlete automatiza todo el proceso:</p>
        <ul>
          <li>
            <strong>Sincronización en un clic:</strong> los planes aparecen al
            instante en tu reloj
          </li>
          <li>
            <strong>Actualizaciones automáticas:</strong> cuando el plan cambia,
            el reloj se actualiza solo
          </li>
          <li>
            <strong>Sin errores:</strong> se acabaron los fallos al introducir
            datos a mano
          </li>
          <li>
            <strong>Multidispositivo:</strong> funciona con Garmin, Polar, Polar
            y más
          </li>
        </ul>

        <p>
          <strong>Cómo funciona:</strong>
        </p>
        <ol>
          <li>El entrenador crea el plan en OpenAthlete</li>
          <li>El plan se sincroniza automáticamente con el reloj del atleta</li>
          <li>El atleta ve la sesión en su reloj, lista para hacerla</li>
          <li>Cuando el plan cambia, el reloj se actualiza automáticamente</li>
        </ol>

        <h2>En resumen</h2>
        <p>
          La sincronización manual funciona, pero es tediosa. La sincronización
          automática ahorra tiempo, evita errores y garantiza que tu reloj tenga
          siempre la última versión del plan. OpenAthlete lo hace sin
          complicaciones.
        </p>

        <p>
          <strong>Deja de adivinar y empieza hoy a entrenar con IA.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Regístrate en OpenAthlete
          </a>{' '}
          y prueba la sincronización automática de entrenamientos con tu reloj.
        </p>
      </div>
    );
  },
};
