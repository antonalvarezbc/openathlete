import type { BlogPost } from './types';

export const articleInjuryPrevention2: BlogPost = {
  metadata: {
    slug: 'injury-prevention-2-when-algorithms-predict-the-break',
    title: {
      en: 'Injury Prevention 2.0: When Algorithms Predict the Break',
      fr: 'Prévention des Blessures 2.0 : Quand les Algorithmes Prédissent la Rupture',
      es: 'Prevención de lesiones 2.0: cuando los algoritmos predicen la rotura',
    },
    description: {
      en: "Learn how Acute:Chronic Workload Ratio (ACWR) analysis prevents injuries. The danger isn't training hard—it's increasing load too fast. AI alerts you before it's too late.",
      fr: "Apprenez comment l'analyse du Ratio Charge Aiguë:Chronique (ACWR) prévient les blessures. Le danger n'est pas de s'entraîner dur—c'est d'augmenter la charge trop vite. L'IA vous alerte avant qu'il ne soit trop tard.",
      es: 'Descubre cómo el análisis del ratio de carga aguda:crónica (ACWR) previene lesiones. El peligro no es entrenar duro, sino aumentar la carga demasiado rápido. La IA te avisa antes de que sea tarde.',
    },
    excerpt: {
      en: "Most injuries happen when training load increases too quickly. ACWR analysis detects these spikes before they become problems. OpenAthlete alerts athletes before it's too late.",
      fr: "La plupart des blessures surviennent quand la charge d'entraînement augmente trop rapidement. L'analyse ACWR détecte ces pics avant qu'ils ne deviennent des problèmes. OpenAthlete alerte les athlètes avant qu'il ne soit trop tard.",
      es: 'La mayoría de las lesiones se producen cuando la carga de entrenamiento aumenta demasiado deprisa. El análisis del ACWR detecta estos picos antes de que se conviertan en problemas. OpenAthlete avisa a los atletas antes de que sea tarde.',
    },
    author: {
      name: 'OpenAthlete Team',
      email: 'contact@openathlete.org',
    },
    publishedAt: '2025-02-10',
    tags: [
      'Injury Prevention',
      'ACWR',
      'Acute vs Chronic Load',
      'Training Load',
      'Running Injury Prevention',
    ],
    readingTime: 9,
    image:
      'https://images.unsplash.com/photo-1495213882804-d108674f7b83?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4NDE1NDF8MHwxfHNlYXJjaHwxfHx0cmFpbmluZyUyMGxvYWQlMjBncmFwaCUyMGNoYXJ0JTIwaW5jcmVhc2UlMjBzcGlrZSUyMGluanVyeSUyMHJpc2t8ZW58MHwwfHx8MTc2NTI4NzM3NXww&ixlib=rb-4.1.0&q=80&w=1080',
  },
  ContentEn: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            You're feeling great. Your training is going perfectly. You decide
            to push harder—add 20% more volume this week. Three weeks later,
            you're sidelined with a stress fracture.
          </strong>{' '}
          What went wrong?
        </p>

        <p>
          The answer isn't that you trained too hard. The answer is that you
          increased your training load too quickly. This is the fundamental
          principle behind injury prevention 2.0:{' '}
          <strong>
            it's not about avoiding hard training—it's about managing load
            progression intelligently.
          </strong>
        </p>

        <h2>The Science: Acute vs Chronic Load</h2>
        <p>
          Sports scientists have identified a critical metric: the Acute:Chronic
          Workload Ratio (ACWR). Here's what it means:
        </p>
        <ul>
          <li>
            <strong>Acute Load:</strong> Your training load over the past week
            (7 days). This is your recent stress.
          </li>
          <li>
            <strong>Chronic Load:</strong> Your average training load over the
            past 4 weeks (28 days). This is your baseline fitness.
          </li>
          <li>
            <strong>ACWR:</strong> The ratio between acute and chronic load.
            This tells you if you're progressing safely.
          </li>
        </ul>

        <p>
          Research shows that when ACWR exceeds 1.5, injury risk increases
          dramatically. When it's below 0.8, you're likely detraining. The sweet
          spot? Between 0.8 and 1.3—progressive overload without excessive risk.
        </p>

        <h2>Why Load Spikes Cause Injuries</h2>
        <p>
          Your body adapts to training stress gradually. When you suddenly
          increase load by 30%, your tissues (muscles, tendons, bones) haven't
          had time to adapt. The result? Microtrauma accumulates faster than
          your body can repair it. This leads to:
        </p>
        <ul>
          <li>Stress fractures</li>
          <li>Tendinopathies</li>
          <li>Muscle strains</li>
          <li>Overuse injuries</li>
        </ul>

        <p>
          The dangerous part? These injuries often don't show symptoms until
          it's too late. By the time you feel pain, the damage is already
          significant.
        </p>

        <h2>The Traditional Problem</h2>
        <p>
          Most athletes and coaches track volume and intensity separately. They
          might know they ran 50km this week vs 40km last week, but they don't
          see the relationship between recent load and baseline fitness. This
          blind spot is where injuries happen.
        </p>

        <p>Consider this scenario:</p>
        <ul>
          <li>Week 1-3: 40km/week average (chronic load = 40km)</li>
          <li>Week 4: You feel great, so you run 60km (acute load = 60km)</li>
          <li>ACWR = 60/40 = 1.5 (danger zone)</li>
        </ul>

        <p>
          Without ACWR analysis, this looks fine—you're just training harder.
          But the math reveals the risk. Your body hasn't adapted to handle
          60km/week yet. You're in the injury risk zone.
        </p>

        <h2>How AI Prevents This</h2>
        <p>
          OpenAthlete calculates ACWR automatically after every session. It
          tracks:
        </p>
        <ul>
          <li>Your acute load (past 7 days)</li>
          <li>Your chronic load (past 28 days)</li>
          <li>The ratio between them</li>
          <li>Trends over time</li>
        </ul>

        <p>
          When ACWR approaches 1.5, the system alerts you and your coach. It
          might suggest:
        </p>
        <ul>
          <li>Reducing this week's volume by 10-15%</li>
          <li>Maintaining current load for another week before increasing</li>
          <li>Adding an extra recovery day</li>
          <li>Shifting intensity rather than volume</li>
        </ul>

        <p>
          This happens proactively—before you feel pain, before you're
          sidelined, before your goals are derailed.
        </p>

        <h2>Beyond Simple Volume</h2>
        <p>
          ACWR isn't just about distance. OpenAthlete calculates load using
          multiple factors:
        </p>
        <ul>
          <li>
            <strong>Volume:</strong> Distance, duration, repetitions
          </li>
          <li>
            <strong>Intensity:</strong> Pace, power, heart rate zones
          </li>
          <li>
            <strong>RPE:</strong> Perceived exertion (internal load)
          </li>
          <li>
            <strong>Modality:</strong> Running vs cycling vs swimming (different
            stress patterns)
          </li>
        </ul>

        <p>
          This comprehensive approach gives a true picture of training stress,
          not just volume. A 10km tempo run creates more load than a 10km easy
          run, even though distance is identical.
        </p>

        <h2>Real-World Example</h2>
        <p>
          Marcus, a triathlete, was preparing for an Ironman. His training was
          going well, and he felt strong. After a particularly good week, he
          decided to add extra sessions.
        </p>

        <p>
          OpenAthlete detected his ACWR spiking to 1.6—well into the danger
          zone. It sent an alert to both Marcus and his coach, suggesting a 15%
          volume reduction for the following week.
        </p>

        <p>
          Marcus was initially frustrated—he felt great, why reduce training?
          But his coach explained the science, and they followed the
          recommendation.
        </p>

        <p>
          Two weeks later, Marcus's training partner—who didn't use load
          monitoring—developed a stress fracture and had to withdraw from the
          race. Marcus completed his Ironman injury-free.
        </p>

        <p>
          The difference? One athlete had data-driven protection. The other
          relied on "feeling."
        </p>

        <h2>The Post-Session Analysis</h2>
        <p>
          Here's where OpenAthlete's approach becomes powerful. After every
          session, the platform asks for your RPE. This subjective data,
          combined with objective metrics (pace, HR, power), creates a
          comprehensive load picture.
        </p>

        <p>
          If your RPE is elevated relative to your pace and heart rate, that's a
          signal. Your internal load is higher than your external load suggests.
          This might indicate:
        </p>
        <ul>
          <li>Fatigue accumulation</li>
          <li>Insufficient recovery</li>
          <li>Early signs of overreaching</li>
        </ul>

        <p>
          The AI cross-references this with ACWR. If both metrics suggest risk,
          it takes action—adjusting future sessions, suggesting recovery,
          alerting your coach.
        </p>

        <h2>The Bottom Line</h2>
        <p>
          Injury prevention isn't about avoiding hard training. It's about
          progressing intelligently. ACWR analysis provides the data you need to
          push your limits safely.
        </p>

        <p>
          The old approach: train hard, hope you don't get injured, react when
          you do.
        </p>

        <p>
          The new approach: train hard, monitor load progression, prevent
          injuries before they happen.
        </p>

        <p>
          <strong>Stop guessing, start training with AI today.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Sign up for OpenAthlete
          </a>{' '}
          and let AI monitor your ACWR, alert you to risks, and keep you
          training consistently toward your goals.
        </p>
      </div>
    );
  },
  ContentFr: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Vous vous sentez bien. Votre entraînement se passe parfaitement.
            Vous décidez de pousser plus fort—ajoutez 20% de volume en plus
            cette semaine. Trois semaines plus tard, vous êtes sur la touche
            avec une fracture de stress.
          </strong>{' '}
          Qu'est-ce qui n'a pas fonctionné ?
        </p>

        <p>
          La réponse n'est pas que vous vous êtes entraîné trop dur. La réponse
          est que vous avez augmenté votre charge d'entraînement trop
          rapidement. C'est le principe fondamental derrière la prévention des
          blessures 2.0 :{' '}
          <strong>
            il ne s'agit pas d'éviter l'entraînement dur—il s'agit de gérer la
            progression de charge intelligemment.
          </strong>
        </p>

        <h2>La Science : Charge Aiguë vs Charge Chronique</h2>
        <p>
          Les scientifiques du sport ont identifié une métrique critique : le
          Ratio Charge Aiguë:Chronique (ACWR). Voici ce que cela signifie :
        </p>
        <ul>
          <li>
            <strong>Charge Aiguë :</strong> Votre charge d'entraînement sur la
            semaine passée (7 jours). C'est votre stress récent.
          </li>
          <li>
            <strong>Charge Chronique :</strong> Votre charge d'entraînement
            moyenne sur les 4 dernières semaines (28 jours). C'est votre forme
            de base.
          </li>
          <li>
            <strong>ACWR :</strong> Le ratio entre charge aiguë et chronique.
            Cela vous dit si vous progressez en sécurité.
          </li>
        </ul>

        <p>
          La recherche montre que lorsque l'ACWR dépasse 1,5, le risque de
          blessure augmente considérablement. Quand il est en dessous de 0,8,
          vous êtes probablement en désentraînement. La zone idéale ? Entre 0,8
          et 1,3—surcharge progressive sans risque excessif.
        </p>

        <h2>Pourquoi les Pics de Charge Causent des Blessures</h2>
        <p>
          Votre corps s'adapte au stress d'entraînement progressivement. Quand
          vous augmentez soudainement la charge de 30%, vos tissus (muscles,
          tendons, os) n'ont pas eu le temps de s'adapter. Le résultat ? Les
          microtraumatismes s'accumulent plus vite que votre corps ne peut les
          réparer. Cela conduit à :
        </p>
        <ul>
          <li>Fractures de stress</li>
          <li>Tendinopathies</li>
          <li>Déchirures musculaires</li>
          <li>Blessures de surutilisation</li>
        </ul>

        <p>
          La partie dangereuse ? Ces blessures ne montrent souvent pas de
          symptômes jusqu'à ce qu'il soit trop tard. Au moment où vous ressentez
          la douleur, les dommages sont déjà significatifs.
        </p>

        <h2>Le Problème Traditionnel</h2>
        <p>
          La plupart des athlètes et coachs suivent le volume et l'intensité
          séparément. Ils pourraient savoir qu'ils ont couru 50km cette semaine
          vs 40km la semaine dernière, mais ils ne voient pas la relation entre
          la charge récente et la forme de base. Cette zone aveugle est où les
          blessures surviennent.
        </p>

        <p>Considérez ce scénario :</p>
        <ul>
          <li>
            Semaine 1-3 : 40km/semaine en moyenne (charge chronique = 40km)
          </li>
          <li>
            Semaine 4 : Vous vous sentez bien, donc vous courez 60km (charge
            aiguë = 60km)
          </li>
          <li>ACWR = 60/40 = 1,5 (zone de danger)</li>
        </ul>

        <p>
          Sans analyse ACWR, cela semble bien—vous vous entraînez juste plus
          dur. Mais les mathématiques révèlent le risque. Votre corps ne s'est
          pas encore adapté pour gérer 60km/semaine. Vous êtes dans la zone de
          risque de blessure.
        </p>

        <h2>Comment l'IA Prévent Cela</h2>
        <p>
          OpenAthlete calcule l'ACWR automatiquement après chaque séance. Il
          suit :
        </p>
        <ul>
          <li>Votre charge aiguë (7 derniers jours)</li>
          <li>Votre charge chronique (28 derniers jours)</li>
          <li>Le ratio entre eux</li>
          <li>Les tendances dans le temps</li>
        </ul>

        <p>
          Quand l'ACWR approche 1,5, le système vous alerte, vous et votre
          coach. Il pourrait suggérer :
        </p>
        <ul>
          <li>Réduire le volume de cette semaine de 10-15%</li>
          <li>
            Maintenir la charge actuelle pendant une autre semaine avant
            d'augmenter
          </li>
          <li>Ajouter un jour de récupération supplémentaire</li>
          <li>Déplacer l'intensité plutôt que le volume</li>
        </ul>

        <p>
          Cela se produit de manière proactive—avant que vous ressentiez la
          douleur, avant que vous soyez sur la touche, avant que vos objectifs
          ne soient déraillés.
        </p>

        <h2>Au-Delà du Volume Simple</h2>
        <p>
          L'ACWR ne concerne pas seulement la distance. OpenAthlete calcule la
          charge en utilisant plusieurs facteurs :
        </p>
        <ul>
          <li>
            <strong>Volume :</strong> Distance, durée, répétitions
          </li>
          <li>
            <strong>Intensité :</strong> Allure, puissance, zones de fréquence
            cardiaque
          </li>
          <li>
            <strong>RPE :</strong> Effort perçu (charge interne)
          </li>
          <li>
            <strong>Modalité :</strong> Course vs vélo vs natation (modèles de
            stress différents)
          </li>
        </ul>

        <p>
          Cette approche complète donne une image réelle du stress
          d'entraînement, pas seulement du volume. Un 10km au seuil crée plus de
          charge qu'un 10km en endurance, même si la distance est identique.
        </p>

        <h2>Exemple Concret</h2>
        <p>
          Marcus, un triathlète, se préparait pour un Ironman. Son entraînement
          se passait bien, et il se sentait fort. Après une semaine
          particulièrement bonne, il a décidé d'ajouter des séances
          supplémentaires.
        </p>

        <p>
          OpenAthlete a détecté son ACWR qui montait à 1,6—bien dans la zone de
          danger. Il a envoyé une alerte à Marcus et à son coach, suggérant une
          réduction de volume de 15% pour la semaine suivante.
        </p>

        <p>
          Marcus était initialement frustré—il se sentait bien, pourquoi réduire
          l'entraînement ? Mais son coach a expliqué la science, et ils ont
          suivi la recommandation.
        </p>

        <p>
          Deux semaines plus tard, le partenaire d'entraînement de Marcus—qui
          n'utilisait pas le suivi de charge—a développé une fracture de stress
          et a dû se retirer de la course. Marcus a terminé son Ironman sans
          blessure.
        </p>

        <p>
          La différence ? Un athlète avait une protection basée sur les données.
          L'autre s'est fié au "ressenti".
        </p>

        <h2>L'Analyse Post-Séance</h2>
        <p>
          C'est là que l'approche d'OpenAthlete devient puissante. Après chaque
          séance, la plateforme demande votre RPE. Ces données subjectives,
          combinées avec les métriques objectives (allure, FC, puissance),
          créent une image complète de la charge.
        </p>

        <p>
          Si votre RPE est élevé par rapport à votre allure et fréquence
          cardiaque, c'est un signal. Votre charge interne est plus élevée que
          ce que votre charge externe suggère. Cela pourrait indiquer :
        </p>
        <ul>
          <li>Accumulation de fatigue</li>
          <li>Récupération insuffisante</li>
          <li>Signes précoces de surentraînement</li>
        </ul>

        <p>
          L'IA croise cela avec l'ACWR. Si les deux métriques suggèrent un
          risque, elle prend des mesures—ajustant les séances futures, suggérant
          la récupération, alertant votre coach.
        </p>

        <h2>En Résumé</h2>
        <p>
          La prévention des blessures ne consiste pas à éviter l'entraînement
          dur. Il s'agit de progresser intelligemment. L'analyse ACWR fournit
          les données dont vous avez besoin pour pousser vos limites en
          sécurité.
        </p>

        <p>
          L'ancienne approche : s'entraîner dur, espérer ne pas se blesser,
          réagir quand vous le faites.
        </p>

        <p>
          La nouvelle approche : s'entraîner dur, surveiller la progression de
          charge, prévenir les blessures avant qu'elles ne surviennent.
        </p>

        <p>
          <strong>
            Arrêtez de deviner, commencez à vous entraîner avec l'IA dès
            aujourd'hui.
          </strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Inscrivez-vous sur OpenAthlete
          </a>{' '}
          et laissez l'IA surveiller votre ACWR, vous alerter des risques et
          vous garder en entraînement constant vers vos objectifs.
        </p>
      </div>
    );
  },
  ContentEs: () => {
    return (
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p>
          <strong>
            Te sientes genial. Tus entrenamientos van de maravilla. Decides
            apretar más y subes un 20% el volumen esta semana. Tres semanas
            después estás parado con una fractura por estrés.
          </strong>{' '}
          ¿Qué ha fallado?
        </p>

        <p>
          La respuesta no es que entrenaras demasiado duro. La respuesta es que
          aumentaste tu carga de entrenamiento demasiado deprisa. Este es el
          principio fundamental de la prevención de lesiones 2.0:{' '}
          <strong>
            no se trata de evitar el entrenamiento duro, sino de gestionar con
            inteligencia la progresión de la carga.
          </strong>
        </p>

        <h2>La ciencia: carga aguda frente a carga crónica</h2>
        <p>
          Los científicos del deporte han identificado una métrica clave: el
          ratio de carga aguda:crónica (ACWR, por sus siglas en inglés). Esto es
          lo que significa:
        </p>
        <ul>
          <li>
            <strong>Carga aguda:</strong> tu carga de entrenamiento de la última
            semana (7 días). Es tu estrés reciente.
          </li>
          <li>
            <strong>Carga crónica:</strong> tu carga de entrenamiento media de
            las últimas 4 semanas (28 días). Es tu nivel de forma de base.
          </li>
          <li>
            <strong>ACWR:</strong> la relación entre la carga aguda y la
            crónica. Te indica si estás progresando de forma segura.
          </li>
        </ul>

        <p>
          Los estudios muestran que, cuando el ACWR supera 1,5, el riesgo de
          lesión se dispara. Cuando está por debajo de 0,8, lo más probable es
          que estés perdiendo forma. ¿El punto óptimo? Entre 0,8 y 1,3:
          sobrecarga progresiva sin un riesgo excesivo.
        </p>

        <h2>Por qué los picos de carga provocan lesiones</h2>
        <p>
          Tu cuerpo se adapta al estrés del entrenamiento poco a poco. Cuando de
          repente aumentas la carga un 30%, tus tejidos (músculos, tendones,
          huesos) no han tenido tiempo de adaptarse. ¿El resultado? Los
          microtraumatismos se acumulan más rápido de lo que tu cuerpo puede
          repararlos. Y eso lleva a:
        </p>
        <ul>
          <li>Fracturas por estrés</li>
          <li>Tendinopatías</li>
          <li>Distensiones musculares</li>
          <li>Lesiones por sobreuso</li>
        </ul>

        <p>
          ¿Lo peligroso? Estas lesiones a menudo no dan síntomas hasta que es
          demasiado tarde. Cuando notas el dolor, el daño ya es considerable.
        </p>

        <h2>El problema de siempre</h2>
        <p>
          La mayoría de los atletas y entrenadores controlan el volumen y la
          intensidad por separado. Puede que sepan que esta semana han corrido
          50 km frente a los 40 km de la anterior, pero no ven la relación entre
          la carga reciente y el nivel de forma de base. Es en ese punto ciego
          donde se producen las lesiones.
        </p>

        <p>Imagina esta situación:</p>
        <ul>
          <li>Semanas 1-3: media de 40 km/semana (carga crónica = 40 km)</li>
          <li>
            Semana 4: te sientes genial y corres 60 km (carga aguda = 60 km)
          </li>
          <li>ACWR = 60/40 = 1,5 (zona de peligro)</li>
        </ul>

        <p>
          Sin un análisis del ACWR, parece que todo va bien: simplemente
          entrenas más. Pero las cuentas revelan el riesgo. Tu cuerpo todavía no
          se ha adaptado para asumir 60 km/semana. Estás en la zona de riesgo de
          lesión.
        </p>

        <h2>Cómo lo previene la IA</h2>
        <p>
          OpenAthlete calcula el ACWR automáticamente después de cada sesión.
          Controla:
        </p>
        <ul>
          <li>Tu carga aguda (últimos 7 días)</li>
          <li>Tu carga crónica (últimos 28 días)</li>
          <li>La relación entre ambas</li>
          <li>Las tendencias a lo largo del tiempo</li>
        </ul>

        <p>
          Cuando el ACWR se acerca a 1,5, el sistema os avisa a ti y a tu
          entrenador. Puede proponer:
        </p>
        <ul>
          <li>Reducir el volumen de esta semana un 10-15%</li>
          <li>Mantener la carga actual una semana más antes de aumentarla</li>
          <li>Añadir un día de recuperación extra</li>
          <li>Jugar con la intensidad en lugar del volumen</li>
        </ul>

        <p>
          Todo esto ocurre de forma proactiva: antes de que sientas dolor, antes
          de que tengas que parar, antes de que tus objetivos se vayan al
          traste.
        </p>

        <h2>Más allá del simple volumen</h2>
        <p>
          El ACWR no va solo de distancia. OpenAthlete calcula la carga teniendo
          en cuenta varios factores:
        </p>
        <ul>
          <li>
            <strong>Volumen:</strong> distancia, duración, repeticiones
          </li>
          <li>
            <strong>Intensidad:</strong> ritmo, potencia, zonas de frecuencia
            cardíaca
          </li>
          <li>
            <strong>RPE:</strong> esfuerzo percibido (carga interna)
          </li>
          <li>
            <strong>Modalidad:</strong> carrera, ciclismo o natación (cada una
            genera un estrés distinto)
          </li>
        </ul>

        <p>
          Este enfoque global ofrece una imagen real del estrés del
          entrenamiento, no solo del volumen. Un rodaje de 10 km a ritmo tempo
          genera más carga que un rodaje suave de 10 km, aunque la distancia sea
          idéntica.
        </p>

        <h2>Un ejemplo real</h2>
        <p>
          Marcus, triatleta, se estaba preparando para un Ironman. Sus
          entrenamientos iban bien y se sentía fuerte. Después de una semana
          especialmente buena, decidió añadir sesiones extra.
        </p>

        <p>
          OpenAthlete detectó que su ACWR se disparaba hasta 1,6, de lleno en la
          zona de peligro. Envió una alerta a Marcus y a su entrenador y propuso
          reducir el volumen un 15% la semana siguiente.
        </p>

        <p>
          Al principio Marcus se frustró: se sentía genial, ¿por qué iba a
          entrenar menos? Pero su entrenador le explicó la ciencia que había
          detrás y siguieron la recomendación.
        </p>

        <p>
          Dos semanas después, su compañero de entrenamiento, que no controlaba
          su carga, sufrió una fractura por estrés y tuvo que retirarse de la
          carrera. Marcus terminó su Ironman sin lesiones.
        </p>

        <p>
          ¿La diferencia? Uno de los atletas tenía la protección de los datos.
          El otro se fiaba de las «sensaciones».
        </p>

        <h2>El análisis después de cada sesión</h2>
        <p>
          Aquí es donde el enfoque de OpenAthlete marca la diferencia. Después
          de cada sesión, la plataforma te pide tu RPE. Este dato subjetivo,
          combinado con métricas objetivas (ritmo, FC, potencia), ofrece una
          imagen completa de la carga.
        </p>

        <p>
          Si tu RPE es elevado en relación con tu ritmo y tu frecuencia
          cardíaca, es una señal. Tu carga interna es mayor de lo que sugiere tu
          carga externa. Puede indicar:
        </p>
        <ul>
          <li>Acumulación de fatiga</li>
          <li>Recuperación insuficiente</li>
          <li>Primeros signos de sobrecarga</li>
        </ul>

        <p>
          La IA cruza este dato con el ACWR. Si ambas métricas apuntan a un
          riesgo, actúa: ajusta las siguientes sesiones, propone recuperación y
          avisa a tu entrenador.
        </p>

        <h2>En resumen</h2>
        <p>
          Prevenir lesiones no consiste en evitar el entrenamiento duro, sino en
          progresar con inteligencia. El análisis del ACWR te da los datos que
          necesitas para llevar tus límites más allá con seguridad.
        </p>

        <p>
          El enfoque de siempre: entrenar duro, cruzar los dedos para no
          lesionarse y reaccionar cuando ocurre.
        </p>

        <p>
          El nuevo enfoque: entrenar duro, controlar la progresión de la carga y
          prevenir las lesiones antes de que aparezcan.
        </p>

        <p>
          <strong>Deja de adivinar y empieza hoy a entrenar con IA.</strong>{' '}
          <a href="https://app.openathlete.org/auth/create-account">
            Regístrate en OpenAthlete
          </a>{' '}
          y deja que la IA controle tu ACWR, te avise de los riesgos y te ayude
          a entrenar con regularidad hacia tus objetivos.
        </p>
      </div>
    );
  },
};
