import { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faArrowUpRightFromSquare,
  faTrophy,
} from '@fortawesome/free-solid-svg-icons';
import type { PublicUser } from '../api/auth';
import { AvatarSvg } from './auth/avatars';
import './HomeScreen.css';

function Pin({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="24"
      height="28"
      viewBox="0 0 24 28"
      fill="none"
      aria-hidden="true"
    >
      <path d="M22 11C22 19 12 26 12 26S2 19 2 11a10 10 0 1 1 20 0Z" fill="currentColor" />
      <circle cx="12" cy="11" r="3.5" fill="var(--home-paper, #5e8797)" />
    </svg>
  );
}

export function HomeScreen({
  user,
  onLogout,
  onStartTraining,
  onStartRanked,
  onOpenRanking,
}: {
  user: PublicUser;
  onLogout: () => void;
  onStartTraining: () => void;
  onStartRanked: () => void;
  onOpenRanking: () => void;
}) {
  const instructionsRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="home-screen">
      <header className="home-header">
        <div className="home-brand">
          <span>
            PA<span className="brand-light">guessr</span>
            <span className="brand-dot">.</span>
          </span>
        </div>
        <div className="home-player">
          <span>
            <AvatarSvg id={user.avatarId} />
          </span>
          {user.nick}
          <button type="button" className="home-logout" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>
      <main className="home-main">
        <section className="home-intro" aria-labelledby="home-title">
          <div className="game-emblem" aria-hidden="true">
            <span />
            <Pin />
            <span />
          </div>
          <h1 id="home-title" className="menu-logo">
            <span>
              PA<span>guessr</span>
              <b>.</b>
            </span>
          </h1>
          <p className="menu-location">PAULO AFONSO · BAHIA</p>
          <div className="round-track" aria-label="Partida de 5 rodadas">
            <span className="round-track-label">MODO CLÁSSICO</span>
            <div aria-hidden="true">
              {[1, 2, 3, 4, 5].map((round) => (
                <span key={round}>{round}</span>
              ))}
            </div>
          </div>
          <nav className="game-menu" aria-label="Menu principal">
            <button className="home-play" onClick={onStartTraining}>
              <span className="play-triangle" aria-hidden="true" />
              <span>TREINO</span>
              <span className="play-arrow" aria-hidden="true">
                <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </button>
            <button className="home-play home-play-ranked" onClick={onStartRanked}>
              <span className="play-triangle" aria-hidden="true" />
              <span>RANQUEADO</span>
              <span className="play-arrow" aria-hidden="true">
                <FontAwesomeIcon icon={faArrowRight} />
              </span>
            </button>
            <button
              className="menu-help"
              onClick={() => instructionsRef.current?.showModal()}
              aria-haspopup="dialog"
            >
              <span className="menu-help-icon" aria-hidden="true">
                ?
              </span>{' '}
              Como jogar{' '}
              <span aria-hidden="true">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </span>
            </button>
            <button className="menu-help" onClick={onOpenRanking}>
              <span className="menu-help-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faTrophy} />
              </span>{' '}
              Ranking{' '}
              <span aria-hidden="true">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </span>
            </button>
          </nav>
        </section>

        <div className="home-art" aria-hidden="true">
          <div className="terrain-beacon beacon-one">
            <Pin />
            <span />
          </div>
          <div className="terrain-beacon beacon-two">
            <Pin />
            <span />
          </div>
          <svg
            className="home-map"
            viewBox="0 0 620 570"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <pattern id="map-grid" width="34" height="34" patternUnits="userSpaceOnUse">
                <path d="M34 0H0V34" stroke="#29445f" strokeWidth=".8" />
              </pattern>
            </defs>
            <path fill="#122a40" d="M0 0h620v570H0z" />
            <path fill="url(#map-grid)" d="M0 0h620v570H0z" />
            <g stroke="#29455a" strokeWidth="1.3">
              <path d="M-30 80Q100 5 233 107T651 64M-20 99Q100 23 233 125T651 82M-20 118Q100 42 233 144T651 101M-20 137Q100 61 233 163T651 120M-20 156Q100 80 233 182T651 139M-20 175Q100 99 233 201T651 158M-20 425Q100 350 233 452T651 409M-20 444Q100 369 233 471T651 428M-20 463Q100 388 233 490T651 447M-20 482Q100 407 233 509T651 466M-20 501Q100 426 233 528T651 485" />
            </g>
            <path
              d="M455-30C310 65 570 105 426 213S334 363 413 401 438 539 300 610"
              stroke="#194961"
              strokeWidth="102"
            />
            <path
              d="M455-30C310 65 570 105 426 213S334 363 413 401 438 539 300 610"
              stroke="#20637a"
              strokeWidth="71"
            />
            <g stroke="#476a7e" strokeWidth="9" strokeLinejoin="round">
              <path d="M31 320 227 122 390 268 227 455 30 320ZM82 267 281 400M132 216 331 345M181 165 377 294M77 365 278 169M128 411 333 219M25 226 270 466" />
            </g>
            <path d="m315 317 138 21" stroke="#5e8797" strokeWidth="10" />
            <path d="m315 317 138 21" stroke="#83b2c5" strokeWidth="2" strokeDasharray="5 4" />
            <path
              d="M124 337Q159 271 222 292T306 228"
              stroke="#3ee3b0"
              strokeWidth="3"
              strokeDasharray="7 7"
            />
            <circle cx="124" cy="337" r="12" fill="#3ee3b0" fillOpacity=".15" />
            <circle cx="124" cy="337" r="5" fill="#3ee3b0" />
            <g transform="translate(287 176)">
              <ellipse cx="20" cy="57" rx="19" ry="6" fill="#38cba1" fillOpacity=".2" />
              <path
                d="M42 23C42 39 21 56 21 56S0 39 0 23a21 21 0 1 1 42 0Z"
                fill="#39e5a9"
                stroke="#b0ffe8"
                strokeWidth="4"
              />
              <circle cx="21" cy="22" r="7" fill="#12374a" />
            </g>
            <text
              x="462"
              y="388"
              fill="#76b8c9"
              fontSize="12"
              letterSpacing="3"
              transform="rotate(64 462 388)"
            >
              RIO SÃO FRANCISCO
            </text>
            <g transform="translate(548 91)" stroke="#71a7bb">
              <circle r="26" />
              <path d="m0-19 6 25-6-5-6 5Z" fill="#71a7bb" />
              <text x="-4" y="-36" fill="#71a7bb" stroke="none" fontSize="11">
                N
              </text>
            </g>
          </svg>
        </div>
      </main>
      <dialog
        ref={instructionsRef}
        className="home-instructions"
        aria-labelledby="instructions-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) instructionsRef.current?.close();
        }}
      >
        <div className="instructions-content">
          <div className="instructions-header">
            <h2 id="instructions-title">Como jogar</h2>
            <button
              autoFocus
              className="instructions-close"
              aria-label="Fechar instruções"
              onClick={() => instructionsRef.current?.close()}
            >
              ×
            </button>
          </div>
          <ol className="instructions-steps">
            <li>
              <span className="instruction-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="6" width="24" height="20" rx="3" />
                  <circle cx="21" cy="12" r="2" />
                  <path d="m5 23 8-9 7 8 4-4 4 5" />
                </svg>
              </span>
              <div>
                <h3>Observe a foto</h3>
                <p>Procure pistas e reconheça o lugar.</p>
              </div>
            </li>
            <li>
              <span className="instruction-icon" aria-hidden="true">
                <Pin />
              </span>
              <div>
                <h3>Marque seu palpite</h3>
                <p>Toque no mapa e confirme o ponto.</p>
              </div>
            </li>
            <li>
              <span className="instruction-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="12" />
                  <circle cx="16" cy="16" r="7" />
                  <circle cx="16" cy="16" r="2" />
                </svg>
              </span>
              <div>
                <h3>Quanto mais perto, melhor</h3>
                <p>Até 5.000 pontos em cada rodada.</p>
              </div>
            </li>
          </ol>
          <button
            className="home-play instructions-play"
            onClick={() => {
              instructionsRef.current?.close();
              onStartTraining();
            }}
          >
            Entendi, vamos jogar{' '}
            <span className="play-arrow" aria-hidden="true">
              <FontAwesomeIcon icon={faArrowRight} />
            </span>
          </button>
        </div>
      </dialog>
    </div>
  );
}
