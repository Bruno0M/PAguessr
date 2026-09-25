import { useState, useEffect, useRef, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { AvatarSvg } from '../auth/avatars';
import type { PublicUser } from '../../api/auth';
import type { ApiRankingEntry } from '../../api/ranking';
import {
  acknowledgeFraudNotice,
  type FraudNoticePendingResponse,
} from '../../api/fraudNotice';
import { useReducedMotion } from '../title/useReducedMotion';
import './FraudNoticeModal.css';

interface FraudNoticeModalProps {
  notice: FraudNoticePendingResponse;
  user: PublicUser;
  onClose: () => void;
}

function formatScore(val: number): string {
  return val.toLocaleString('pt-BR');
}

export function FraudNoticeModal({ notice, user, onClose }: FraudNoticeModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const reducedMotion = useReducedMotion();
  const hasAnimation = !reducedMotion && notice.before !== null;

  const [currentPosition, setCurrentPosition] = useState<number>(() =>
    hasAnimation && notice.before ? notice.before.position : notice.after.position
  );
  const [currentScore, setCurrentScore] = useState<number>(() =>
    hasAnimation && notice.before ? notice.before.score : notice.after.score
  );
  const [isAnimating, setIsAnimating] = useState<boolean>(hasAnimation);
  const [isAcking, setIsAcking] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const playerRowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
  }, []);

  const gapInfo = useMemo(() => {
    if (!notice.gap || notice.entries.length < 2) return null;
    for (let i = 0; i < notice.entries.length - 1; i++) {
      if (notice.entries[i + 1].position > notice.entries[i].position + 1) {
        return {
          gapIndex: i,
          p1: notice.entries[i].position,
          p2: notice.entries[i + 1].position,
        };
      }
    }
    return null;
  }, [notice.gap, notice.entries]);

  useEffect(() => {
    if (step !== 2 || !hasAnimation || !notice.before) {
      setIsAnimating(false);
      return;
    }

    const startPos = notice.before.position;
    const endPos = notice.after.position;
    const startScore = notice.before.score;
    const endScore = notice.after.score;
    const totalDuration = 4000;
    const startTime = performance.now();

    let animationFrameId: number;

    const animate = (currentTime: number) => {
      const elapsed = Math.min(totalDuration, currentTime - startTime);
      const overallProgress = elapsed / totalDuration;

      setCurrentScore(Math.round(startScore + overallProgress * (endScore - startScore)));

      if (gapInfo) {
        const t1 = 1800;
        const tGap = 400;
        const t2 = 1800;

        if (elapsed <= t1) {
          const u = elapsed / t1;
          setCurrentPosition(Math.round(startPos + u * (gapInfo.p1 - startPos)));
        } else if (elapsed <= t1 + tGap) {
          const u = (elapsed - t1) / tGap;
          setCurrentPosition(Math.round(gapInfo.p1 + u * (gapInfo.p2 - gapInfo.p1)));
        } else {
          const u = Math.min(1, (elapsed - t1 - tGap) / t2);
          setCurrentPosition(Math.round(gapInfo.p2 + u * (endPos - gapInfo.p2)));
        }
      } else {
        setCurrentPosition(Math.round(startPos + overallProgress * (endPos - startPos)));
      }

      if (elapsed < totalDuration) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setCurrentPosition(endPos);
        setCurrentScore(endScore);
        setIsAnimating(false);
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [step, hasAnimation, notice.before, notice.after, gapInfo]);

  useEffect(() => {
    if (step === 2 && listRef.current && playerRowRef.current) {
      const container = listRef.current;
      const row = playerRowRef.current;
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;

      if (rowBottom > containerBottom) {
        container.scrollTop = rowBottom - container.clientHeight + 8;
      } else if (rowTop < containerTop) {
        container.scrollTop = rowTop - 8;
      }
    }
  }, [currentPosition, step]);

  const handleClose = async () => {
    setIsAcking(true);
    try {
      await acknowledgeFraudNotice();
    } catch {
      // Ignora erro para não travar o jogador
    } finally {
      setIsAcking(false);
      onClose();
    }
  };

  const renderList = () => {
    const playerRow = (
      <li key="fraud-player-row" ref={playerRowRef} className="fraud-ranking-row is-me">
        <span className="fraud-ranking-position">{currentPosition}º</span>
        <AvatarSvg id={user.avatarId} className="fraud-ranking-avatar" />
        <span className="fraud-ranking-nick">
          {user.nick}
          <span className="fraud-ranking-you">Você</span>
        </span>
        <span className={`fraud-ranking-score${currentScore < 0 ? ' is-negative' : ''}`}>
          {formatScore(currentScore)} <small>pts</small>
        </span>
      </li>
    );

    const renderEntry = (entry: ApiRankingEntry) => (
      <li key={entry.userId} className="fraud-ranking-row">
        <span className="fraud-ranking-position">{entry.position}º</span>
        <AvatarSvg id={entry.avatarId} className="fraud-ranking-avatar" />
        <span className="fraud-ranking-nick">{entry.nick}</span>
        <span className={`fraud-ranking-score${entry.score < 0 ? ' is-negative' : ''}`}>
          {formatScore(entry.score)} <small>pts</small>
        </span>
      </li>
    );

    const gapSeparator = (
      <li key="fraud-gap-row" className="fraud-ranking-gap" aria-label="Jogadores omitidos">
        <span>…</span>
      </li>
    );

    if (gapInfo) {
      const chunk1 = notice.entries.slice(0, gapInfo.gapIndex + 1);
      const chunk2 = notice.entries.slice(gapInfo.gapIndex + 1);

      if (currentPosition <= gapInfo.p1) {
        const insertIdx = chunk1.findIndex((e) => e.position >= currentPosition);
        const beforeItems = insertIdx === -1 ? chunk1 : chunk1.slice(0, insertIdx);
        const afterItems = insertIdx === -1 ? [] : chunk1.slice(insertIdx);
        return (
          <>
            {beforeItems.map(renderEntry)}
            {playerRow}
            {afterItems.map(renderEntry)}
            {gapSeparator}
            {chunk2.map(renderEntry)}
          </>
        );
      }

      if (currentPosition < gapInfo.p2) {
        return (
          <>
            {chunk1.map(renderEntry)}
            {gapSeparator}
            {playerRow}
            {chunk2.map(renderEntry)}
          </>
        );
      }

      const insertIdx = chunk2.findIndex((e) => e.position >= currentPosition);
      const beforeItems = insertIdx === -1 ? chunk2 : chunk2.slice(0, insertIdx);
      const afterItems = insertIdx === -1 ? [] : chunk2.slice(insertIdx);
      return (
        <>
          {chunk1.map(renderEntry)}
          {gapSeparator}
          {beforeItems.map(renderEntry)}
          {playerRow}
          {afterItems.map(renderEntry)}
        </>
      );
    }

    const insertIdx = notice.entries.findIndex((e) => e.position >= currentPosition);
    const beforeItems = insertIdx === -1 ? notice.entries : notice.entries.slice(0, insertIdx);
    const afterItems = insertIdx === -1 ? [] : notice.entries.slice(insertIdx);

    return (
      <>
        {beforeItems.map(renderEntry)}
        {playerRow}
        {afterItems.map(renderEntry)}
      </>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="fraud-notice-dialog"
      aria-labelledby={step === 1 ? 'fraud-step1-title' : 'fraud-step2-title'}
      onCancel={(e) => e.preventDefault()}
    >
      <div className="fraud-notice-panel">
        {step === 1 ? (
          <div className="fraud-step1">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="fraud-step1-icon"
              aria-hidden="true"
            />
            <h2 id="fraud-step1-title" className="fraud-step1-title">
              Atividade irregular detectada
            </h2>
            <p className="fraud-step1-desc">
              Identificamos algo estranho nas suas partidas recentes. Por isso, você perde os{' '}
              <strong>{formatScore(notice.penalty)}</strong> pontos ganhos nelas.
            </p>
            <button
              type="button"
              className="game-cta fraud-modal-cta"
              onClick={() => setStep(2)}
              autoFocus
            >
              Entendi
            </button>
          </div>
        ) : (
          <div className="fraud-step2">
            <h2 id="fraud-step2-title" className="fraud-notice-title">
              Parabéns! Esse agora é seu novo Ranking :)
            </h2>
            <ol ref={listRef} className="fraud-ranking-list">
              {renderList()}
            </ol>
            <button
              type="button"
              className="game-cta fraud-modal-cta"
              onClick={handleClose}
              disabled={isAnimating || isAcking}
              autoFocus={!isAnimating}
            >
              {isAcking ? 'Salvando...' : isAnimating ? 'Calculando ranking...' : 'Fechar'}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
