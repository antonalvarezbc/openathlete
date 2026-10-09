import type { BlogPost } from './types';

export const articleRpeVsHr: BlogPost = {
  metadata: {
    slug: 'rpe-vs-heart-rate-why-your-heart-doesnt-tell-the-whole-story',
    title: {
      en: "RPE vs Heart Rate: Why Your Heart Doesn't Tell the Whole Story",
      fr: 'RPE vs Fréquence Cardiaque : Pourquoi votre cœur ne dit pas tout',
      es: 'RPE o frecuencia cardíaca: por qué tu corazón no lo cuenta todo',
    },
    description: {
      en: 'Discover why RPE (Rate of Perceived Exertion) and internal load matter more than heart rate alone. Learn how AI cross-references both to prevent overtraining.',
      fr: "Découvrez pourquoi le RPE (Ressenti) et la charge interne comptent plus que la fréquence cardiaque seule. Apprenez comment l'IA croise les deux pour prévenir le surentraînement.",
      es: 'Descubre por qué el RPE (esfuerzo percibido) y la carga interna importan más que la frecuencia cardíaca por sí sola, y cómo la IA cruza ambos datos para prevenir el sobreentrenamiento.',
    },
    excerpt: {
      en: "Your heart rate shows external load, but RPE reveals internal load. Stress, sleep, and mental fatigue impact performance in ways your watch can't measure.",
      fr: 'Votre fréquence cardiaque montre la charge externe, mais le RPE révèle la charge interne. Le stress, le sommeil et la fatigue mentale impactent les performances de manière que votre montre ne peut pas mesurer.',
      es: 'Tu frecuencia cardíaca refleja la carga externa, pero el RPE revela la carga interna. El estrés, el sueño y la fatiga mental afectan al rendimiento de formas que tu reloj no puede medir.',
    },
    author: {
      name: 'OpenAthlete Team',
      email: 'contact@openathlete.org',
    },
    publishedAt: '2025-02-01',
    tags: ['RPE', 'Heart Rate', 'Training Load', 'HRV', 'Mental Fatigue'],
    readingTime: 8,
    image:
      'https://images.unsplash.com/photo-1685122089835-929f7582da91?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4NDE1NDF8MHwxfHNlYXJjaHwxfHxoZWFydCUyMHJhdGUlMjBtb25pdG9yJTIwd2F0Y2glMjB2cyUyMHBlcmNlaXZlZCUyMGV4ZXJ0aW9uJTIwcnVubmluZyUyMGF0aGxldGUlMjBjb21wYXJpc29ufGVufDB8MHx8fDE3NjUyODczNzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
  },
  ContentEn: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            You just finished a 10K run. Your heart rate averaged 165
            bpm—exactly what your training plan prescribed. But something feels
            off.
          </strong>{' '}
          The session felt harder than it should have. Your legs were heavy from
          the start. You're questioning whether you're overtraining, but your
          watch says everything is fine.
        </p>

        <p>
          This is the problem with relying solely on heart rate data. Your heart
          rate measures <strong>external load</strong>—what your body is doing.
          But it doesn't capture <strong>internal load</strong>—how your body is
          responding. That gap is where injuries happen and progress stalls.
        </p>

        <h2>The Science: External vs Internal Load</h2>
        <p>
          Sports science distinguishes between two types of training stress:
        </p>
        <ul>
          <li>
            <strong>External Load:</strong> What you do—distance, pace, power
            output, heart rate zones. This is what your Garmin or Strava
            captures.
          </li>
          <li>
            <strong>Internal Load:</strong> How your body responds—fatigue,
            stress, recovery status, perceived effort. This is what RPE
            measures.
          </li>
        </ul>

        <p>
          Here's the critical insight:{' '}
          <strong>
            the same external load can produce vastly different internal loads
          </strong>{' '}
          depending on your recovery status, stress levels, sleep quality, and
          mental state.
        </p>

        <h2>Why Heart Rate Alone Fails</h2>
        <p>
          Your heart rate is influenced by countless factors beyond training
          intensity:
        </p>
        <ul>
          <li>
            <strong>Caffeine:</strong> Can elevate HR by 10-15 bpm
          </li>
          <li>
            <strong>Dehydration:</strong> Reduces stroke volume, increases HR
          </li>
          <li>
            <strong>Heat:</strong> Cardiovascular drift can add 10-20 bpm
          </li>
          <li>
            <strong>Stress:</strong> Elevated cortisol affects HR variability
          </li>
          <li>
            <strong>Sleep debt:</strong> Impacts autonomic nervous system
            function
          </li>
        </ul>

        <p>
          More importantly, heart rate doesn't tell you if a session felt "easy"
          or "hard" relative to your current state. A 160 bpm run after a good
          night's sleep feels completely different than 160 bpm after three
          nights of poor sleep—even though the numbers are identical.
        </p>

        <h2>The RPE Solution</h2>
        <p>
          Rate of Perceived Exertion (RPE) fills this gap. When you rate a
          session on a scale of 1-10, you're quantifying your internal load.
          Research shows that RPE correlates strongly with actual physiological
          stress, often more accurately than heart rate alone.
        </p>

        <p>
          But here's the challenge: RPE is subjective. It varies between
          athletes. It can be influenced by mood, motivation, and even the
          weather. That's why you need both—external load (HR, pace, power) and
          internal load (RPE)—cross-referenced intelligently.
        </p>

        <h2>How AI Bridges the Gap</h2>
        <p>
          This is where OpenAthlete's AI becomes essential. After every session,
          the platform asks for your RPE. It then analyzes:
        </p>
        <ul>
          <li>Your RPE relative to your historical patterns</li>
          <li>Your RPE relative to the external load (pace, HR, power)</li>
          <li>Trends over time—are sessions feeling harder?</li>
          <li>Correlation with sleep, stress, and recovery markers</li>
        </ul>

        <p>
          When your RPE spikes while your heart rate stays normal, that's a red
          flag. It might indicate:
        </p>
        <ul>
          <li>Overtraining syndrome</li>
          <li>Insufficient recovery</li>
          <li>Mental fatigue</li>
          <li>Early signs of illness</li>
        </ul>

        <p>
          The AI detects these patterns before they become problems. It might
          suggest reducing intensity, adding a recovery day, or investigating
          sleep quality. This proactive approach prevents the injuries and
          burnout that derail so many athletes.
        </p>

        <h2>Real-World Example</h2>
        <p>
          Sarah, a marathon runner, noticed her RPE was consistently 2-3 points
          higher than normal for the same pace and heart rate. Her watch showed
          everything was fine—she was hitting her zones. But OpenAthlete flagged
          the pattern and suggested she reduce volume by 20% for a week.
        </p>

        <p>
          Two weeks later, her RPE normalized. She avoided what would have
          likely become a stress fracture. Her watch never would have caught
          it—the numbers looked perfect. But her body was telling a different
          story through RPE.
        </p>

        <h2>The Bottom Line</h2>
        <p>
          Heart rate is valuable data, but it's incomplete. Your body's response
          to training—captured through RPE—is equally important. By combining
          both through intelligent analysis, you can train smarter, prevent
          injuries, and make consistent progress.
        </p>

        <p>
          <strong>Stop guessing, start training with AI today.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Sign up for OpenAthlete
          </a>{' '}
          and let AI cross-reference your external and internal load to keep you
          healthy and progressing.
        </p>
      </div>
    );
  },
  ContentFr: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Vous venez de terminer un 10K. Votre fréquence cardiaque moyenne
            était de 165 bpm—exactement ce que votre plan d'entraînement
            prescrivait. Mais quelque chose ne va pas.
          </strong>{' '}
          La séance a semblé plus dure qu'elle ne devrait. Vos jambes étaient
          lourdes dès le départ. Vous vous demandez si vous êtes en
          surentraînement, mais votre montre dit que tout va bien.
        </p>

        <p>
          C'est le problème de se fier uniquement aux données de fréquence
          cardiaque. Votre fréquence cardiaque mesure la{' '}
          <strong>charge externe</strong>—ce que fait votre corps. Mais elle ne
          capture pas la <strong>charge interne</strong>—comment votre corps
          répond. C'est dans cet écart que les blessures surviennent et que les
          progrès stagnent.
        </p>

        <h2>La Science : Charge Externe vs Charge Interne</h2>
        <p>
          La science du sport distingue deux types de stress d'entraînement :
        </p>
        <ul>
          <li>
            <strong>Charge Externe :</strong> Ce que vous faites—distance,
            allure, puissance, zones de fréquence cardiaque. C'est ce que votre
            Garmin ou Strava capture.
          </li>
          <li>
            <strong>Charge Interne :</strong> Comment votre corps
            répond—fatigue, stress, statut de récupération, ressenti. C'est ce
            que le RPE mesure.
          </li>
        </ul>

        <p>
          Voici l'idée cruciale :{' '}
          <strong>
            la même charge externe peut produire des charges internes très
            différentes
          </strong>{' '}
          selon votre statut de récupération, vos niveaux de stress, la qualité
          du sommeil et votre état mental.
        </p>

        <h2>Pourquoi la Fréquence Cardiaque Seule Échoue</h2>
        <p>
          Votre fréquence cardiaque est influencée par d'innombrables facteurs
          au-delà de l'intensité d'entraînement :
        </p>
        <ul>
          <li>
            <strong>Caféine :</strong> Peut augmenter la FC de 10-15 bpm
          </li>
          <li>
            <strong>Déshydratation :</strong> Réduit le volume d'éjection,
            augmente la FC
          </li>
          <li>
            <strong>Chaleur :</strong> La dérive cardiovasculaire peut ajouter
            10-20 bpm
          </li>
          <li>
            <strong>Stress :</strong> Le cortisol élevé affecte la variabilité
            de la FC
          </li>
          <li>
            <strong>Dette de sommeil :</strong> Impacte la fonction du système
            nerveux autonome
          </li>
        </ul>

        <p>
          Plus important encore, la fréquence cardiaque ne vous dit pas si une
          séance a semblé "facile" ou "dure" par rapport à votre état actuel. Un
          10K à 160 bpm après une bonne nuit de sommeil se sent complètement
          différent qu'à 160 bpm après trois nuits de mauvais sommeil—même si
          les chiffres sont identiques.
        </p>

        <h2>La Solution RPE</h2>
        <p>
          Le Ressenti d'Effort Perçu (RPE) comble cet écart. Lorsque vous notez
          une séance sur une échelle de 1 à 10, vous quantifiez votre charge
          interne. La recherche montre que le RPE corrèle fortement avec le
          stress physiologique réel, souvent plus précisément que la fréquence
          cardiaque seule.
        </p>

        <p>
          Mais voici le défi : le RPE est subjectif. Il varie entre les
          athlètes. Il peut être influencé par l'humeur, la motivation et même
          la météo. C'est pourquoi vous avez besoin des deux—charge externe (FC,
          allure, puissance) et charge interne (RPE)—croisées intelligemment.
        </p>

        <h2>Comment l'IA Comble l'Écart</h2>
        <p>
          C'est là que l'IA d'OpenAthlete devient essentielle. Après chaque
          séance, la plateforme demande votre RPE. Elle analyse ensuite :
        </p>
        <ul>
          <li>Votre RPE par rapport à vos modèles historiques</li>
          <li>
            Votre RPE par rapport à la charge externe (allure, FC, puissance)
          </li>
          <li>
            Les tendances dans le temps—les séances deviennent-elles plus dures
            ?
          </li>
          <li>
            La corrélation avec le sommeil, le stress et les marqueurs de
            récupération
          </li>
        </ul>

        <p>
          Lorsque votre RPE augmente alors que votre fréquence cardiaque reste
          normale, c'est un signal d'alarme. Cela peut indiquer :
        </p>
        <ul>
          <li>Syndrome de surentraînement</li>
          <li>Récupération insuffisante</li>
          <li>Fatigue mentale</li>
          <li>Signes précoces de maladie</li>
        </ul>

        <p>
          L'IA détecte ces modèles avant qu'ils ne deviennent des problèmes.
          Elle peut suggérer de réduire l'intensité, d'ajouter un jour de
          récupération, ou d'investiguer la qualité du sommeil. Cette approche
          proactive prévient les blessures et l'épuisement qui font dérailler
          tant d'athlètes.
        </p>

        <h2>Exemple Concret</h2>
        <p>
          Sarah, une marathonienne, a remarqué que son RPE était constamment 2-3
          points plus élevé que la normale pour la même allure et fréquence
          cardiaque. Sa montre montrait que tout allait bien—elle atteignait ses
          zones. Mais OpenAthlete a signalé le modèle et a suggéré de réduire le
          volume de 20% pendant une semaine.
        </p>

        <p>
          Deux semaines plus tard, son RPE s'est normalisé. Elle a évité ce qui
          aurait probablement été une fracture de stress. Sa montre ne l'aurait
          jamais détecté—les chiffres semblaient parfaits. Mais son corps
          racontait une histoire différente à travers le RPE.
        </p>

        <h2>En Résumé</h2>
        <p>
          La fréquence cardiaque est une donnée précieuse, mais elle est
          incomplète. La réponse de votre corps à l'entraînement—capturée par le
          RPE—est tout aussi importante. En combinant les deux grâce à une
          analyse intelligente, vous pouvez vous entraîner plus intelligemment,
          prévenir les blessures et progresser de manière constante.
        </p>

        <p>
          <strong>
            Arrêtez de deviner, commencez à vous entraîner avec l'IA dès
            aujourd'hui.
          </strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Inscrivez-vous sur OpenAthlete
          </a>{' '}
          et laissez l'IA croiser votre charge externe et interne pour vous
          garder en bonne santé et progresser.
        </p>
      </div>
    );
  },
  ContentEs: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Acabas de terminar un 10K. Tu frecuencia cardíaca media ha sido de
            165 ppm, justo lo que marcaba tu plan de entrenamiento. Pero algo no
            cuadra.
          </strong>{' '}
          La sesión se te ha hecho más dura de lo que debería. Tenías las
          piernas pesadas desde el principio. Te preguntas si estás
          sobreentrenado, pero tu reloj dice que todo va bien.
        </p>

        <p>
          Ese es el problema de fiarse solo de la frecuencia cardíaca. Tu
          frecuencia cardíaca mide la <strong>carga externa</strong>: lo que
          hace tu cuerpo. Pero no capta la <strong>carga interna</strong>: cómo
          responde tu cuerpo. En esa diferencia es donde aparecen las lesiones y
          se estanca el progreso.
        </p>

        <h2>La ciencia: carga externa frente a carga interna</h2>
        <p>
          Las ciencias del deporte distinguen dos tipos de estrés del
          entrenamiento:
        </p>
        <ul>
          <li>
            <strong>Carga externa:</strong> lo que haces: distancia, ritmo,
            potencia, zonas de frecuencia cardíaca. Es lo que registran Garmin o
            Strava.
          </li>
          <li>
            <strong>Carga interna:</strong> cómo responde tu cuerpo: fatiga,
            estrés, estado de recuperación, esfuerzo percibido. Es lo que mide
            el RPE.
          </li>
        </ul>

        <p>
          Esta es la idea clave:{' '}
          <strong>
            una misma carga externa puede producir cargas internas muy distintas
          </strong>{' '}
          según tu estado de recuperación, tu nivel de estrés, la calidad de tu
          sueño y tu estado mental.
        </p>

        <h2>Por qué la frecuencia cardíaca sola no basta</h2>
        <p>
          Tu frecuencia cardíaca depende de muchísimos factores, más allá de la
          intensidad del entrenamiento:
        </p>
        <ul>
          <li>
            <strong>Cafeína:</strong> puede elevar la FC entre 10 y 15 ppm
          </li>
          <li>
            <strong>Deshidratación:</strong> reduce el volumen sistólico y
            aumenta la FC
          </li>
          <li>
            <strong>Calor:</strong> la deriva cardiovascular puede sumar entre
            10 y 20 ppm
          </li>
          <li>
            <strong>Estrés:</strong> el cortisol elevado afecta a la
            variabilidad de la FC
          </li>
          <li>
            <strong>Falta de sueño:</strong> altera el funcionamiento del
            sistema nervioso autónomo
          </li>
        </ul>

        <p>
          Y, sobre todo, la frecuencia cardíaca no te dice si una sesión ha sido
          «fácil» o «dura» en relación con tu estado actual. Un rodaje a 160 ppm
          después de una buena noche de sueño no se parece en nada a uno a 160
          ppm tras tres noches durmiendo mal, aunque los números sean idénticos.
        </p>

        <h2>La solución: el RPE</h2>
        <p>
          El esfuerzo percibido (RPE) cubre ese hueco. Cuando valoras una sesión
          en una escala del 1 al 10, estás cuantificando tu carga interna. Los
          estudios muestran que el RPE se correlaciona mucho con el estrés
          fisiológico real, a menudo con más precisión que la frecuencia
          cardíaca por sí sola.
        </p>

        <p>
          Pero aquí está el reto: el RPE es subjetivo. Varía de un atleta a
          otro. Puede verse influido por el estado de ánimo, la motivación e
          incluso el tiempo que hace. Por eso necesitas ambos datos, la carga
          externa (FC, ritmo, potencia) y la carga interna (RPE), cruzados de
          forma inteligente.
        </p>

        <h2>Cómo la IA une ambos mundos</h2>
        <p>
          Aquí es donde la IA de OpenAthlete se vuelve imprescindible. Después
          de cada sesión, la plataforma te pide tu RPE. Luego analiza:
        </p>
        <ul>
          <li>Tu RPE en relación con tus patrones históricos</li>
          <li>Tu RPE en relación con la carga externa (ritmo, FC, potencia)</li>
          <li>
            Las tendencias a lo largo del tiempo: ¿se te hacen más duras las
            sesiones?
          </li>
          <li>
            La correlación con el sueño, el estrés y los marcadores de
            recuperación
          </li>
        </ul>

        <p>
          Cuando tu RPE se dispara mientras tu frecuencia cardíaca sigue normal,
          es una señal de alarma. Puede indicar:
        </p>
        <ul>
          <li>Síndrome de sobreentrenamiento</li>
          <li>Recuperación insuficiente</li>
          <li>Fatiga mental</li>
          <li>Primeros síntomas de una enfermedad</li>
        </ul>

        <p>
          La IA detecta estos patrones antes de que se conviertan en problemas.
          Puede proponerte bajar la intensidad, añadir un día de recuperación o
          revisar la calidad de tu sueño. Este enfoque proactivo evita las
          lesiones y el agotamiento que frenan a tantos atletas.
        </p>

        <h2>Un ejemplo real</h2>
        <p>
          Sarah, maratoniana, se dio cuenta de que su RPE era sistemáticamente 2
          o 3 puntos más alto de lo normal para el mismo ritmo y la misma
          frecuencia cardíaca. Su reloj decía que todo iba bien: estaba dentro
          de sus zonas. Pero OpenAthlete detectó el patrón y le propuso reducir
          el volumen un 20% durante una semana.
        </p>

        <p>
          Dos semanas después, su RPE había vuelto a la normalidad. Se libró de
          lo que probablemente habría acabado en una fractura por estrés. Su
          reloj nunca lo habría detectado: los números parecían perfectos. Pero
          su cuerpo le estaba contando otra historia a través del RPE.
        </p>

        <h2>En resumen</h2>
        <p>
          La frecuencia cardíaca es un dato valioso, pero incompleto. La
          respuesta de tu cuerpo al entrenamiento, recogida a través del RPE, es
          igual de importante. Combinando ambos con un análisis inteligente,
          puedes entrenar mejor, prevenir lesiones y progresar de forma
          constante.
        </p>

        <p>
          <strong>Deja de adivinar y empieza hoy a entrenar con IA.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Regístrate en OpenAthlete
          </a>{' '}
          y deja que la IA cruce tu carga externa y tu carga interna para que
          sigas sano y progresando.
        </p>
      </div>
    );
  },
};
