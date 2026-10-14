/**
 * C-14 KineticText (Web) — révélation d'un texte, lettre par lettre.
 *
 * Fiches PUB-01 (« wordmark clip-path reveal, lettre par lettre, 40 ms/lettre »)
 * et PUB-02 (« titres exposés par ClipPath au scroll ») : la révélation est jouée
 * UNE fois au montage, puis s'arrête (aucune boucle, aucune animation infinie).
 *
 * Invariants :
 *  - le texte reste du texte : chaque lettre est un caractère réel du DOM (aucune
 *    image, aucun fragment) et le contenu textuel de l'élément est la phrase
 *    entière, donc lue correctement par les lecteurs d'écran ;
 *  - l'état de base est VISIBLE : sous prefers-reduced-motion, master.css annule
 *    les animations et la phrase apparaît immédiatement, sans fondu ;
 *  - le retour à la ligne reste celui du texte : les lettres sont groupées par
 *    MOT (jamais coupées au milieu) et l'espace entre deux mots est un vrai nœud
 *    texte du conteneur, donc un point de césure normal. Aucune largeur n'est
 *    mesurée en JavaScript et rien n'anime le layout (clip-path + opacité seuls).
 */

import { Fragment, type CSSProperties, type ElementType } from 'react';
import { cx } from './cx';

export interface KineticTextProps {
  /** Texte réel rendu tel quel (jamais tronqué, jamais remplacé). */
  text: string;
  /** Balise sémantique du conteneur (h1 par défaut pour un titre de fiche). */
  as?: ElementType;
  /** Décalage entre deux lettres, en millisecondes (fiche PUB-01 : 40 ms). */
  staggerMs?: number;
  /** Délai avant la première lettre, en millisecondes. */
  delayMs?: number;
  className?: string;
}

export function KineticText({ text, as: Tag = 'span', staggerMs = 40, delayMs = 0, className }: KineticTextProps) {
  const words = text.split(' ');
  let letterIndex = 0;
  return (
    <Tag className={cx('lbm-kinetic', className)} data-kinetic-stagger={staggerMs}>
      {words.map((word, wordIndex) => (
        <Fragment key={`${word}-${wordIndex}`}>
          <span className="lbm-kinetic__word">
            {[...word].map((character) => {
              const index = letterIndex++;
              return (
                <span
                  key={index}
                  className="lbm-kinetic__char"
                  style={{ '--kinetic-delay': `${delayMs + index * staggerMs}ms` } as CSSProperties}
                >
                  {character}
                </span>
              );
            })}
          </span>
          {wordIndex < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  );
}
